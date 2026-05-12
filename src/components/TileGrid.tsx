// Tile grid — renders the dwindle (Hyprland-style) binary-tree layout
// as absolute-positioned tiles inside a single `.dash-grid` container.
//
// The earlier implementation rendered the tree as nested flex containers,
// which made every tile's React-tree position depend on its tree path.
// Adding or removing a tile re-shaped the surrounding `<div className="
// dash-split">…<div className="dash-split-pane">…` chain, so React saw
// the leaf's parent change identity and unmounted + remounted the widget
// component — taking its in-memory state (logs, scroll position, mirror
// canvas) with it. Absolute positioning keeps every tile a direct child
// of `.dash-grid`, so the widget component instance survives
// add/remove/swap unchanged.
//
// Layout math lives in `lib/layout.ts → computeLayoutRects`. We just
// observe the grid size with ResizeObserver, recompute rects on layout /
// size / gap changes, and stamp `position: absolute; left/top/width/
// height` onto each tile + a thin seam handle between every pair of
// siblings.
//
// Drag UX:
//   - Header drag → swap tiles (drop target highlighted).
//   - Seam handle drag → resize that split.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Tile } from './Tile';
import * as Icons from './Icons';
import { WIDGETS } from '../lib/widgets';
import {
  computeLayoutRects,
  findPath,
  loadLayout,
  nextBarMode,
  patchTile,
  removeTile as removeTileFromLayout,
  restructureTile,
  rightmostLeafId,
  saveLayout,
  setRatio,
  swapTiles,
  addTile as addTileToLayout,
  countByKind,
  MIN_RATIO,
  MAX_RATIO,
  type SplitEdge,
} from '../lib/layout';
import { useDashboardChrome } from '../lib/dashboardChrome';
import { scheduleUrlUpdate } from '../lib/urlState';
import type { LayoutState, WidgetKind } from '../types';

/** Inter-tile gap in pixels (also the seam-handle thickness). */
const NORMAL_GAP = 10;
const COMPACT_GAP = 0;
/**
 * Extra gap added to the live layout while a swap drag is in
 * progress. iOS-style: the icons (tiles) "make room" so the drop
 * zones read more clearly. Animates because each tile already
 * transitions its left/top/width/height, so changing the outer gap
 * smoothly reflows everything.
 */
const DRAG_GAP_BUMP = 10;
/**
 * Hover-hold threshold (ms): how long the user must keep the cursor
 * still over a valid drop zone before the drop fires automatically.
 * Tuned to feel intentional without being slow — too short and the
 * drag commits while the user is still deciding.
 */
const HOVER_HOLD_MS = 900;

interface ResizeDrag {
  kind: 'resize';
  /** Path from the root to the split being resized. */
  path: Array<'a' | 'b'>;
  /** Length available to the split (px) — used to translate dPx → dRatio. */
  innerLen: number;
  /** Ratio at the start of the drag — used as the origin for delta math. */
  originRatio: number;
  /** Pointer position at drag start. */
  startX: number;
  startY: number;
  /** Axis being resized ('row' = horizontal seam = drag x). */
  axis: 'row' | 'col';
}

interface SwapDrag {
  kind: 'swap';
  fromId: string;
  startX: number;
  startY: number;
  /** Live cursor position — used to draw the floating ghost / hit-test. */
  curX: number;
  curY: number;
  /** Tile id under the cursor right now (or null). */
  hoverId: string | null;
  /** Edge of the hovered tile the cursor is over, or null when in the
   *  centre (swap zone). Drives the edge-highlight overlay and the
   *  swap-vs-restructure branch on drop. */
  hoverEdge: SplitEdge | null;
  /** True once the cursor has moved more than a few px from the start. */
  active: boolean;
  /** True for ~200ms after the hover-hold auto-commit fires — drives a
   *  quick blink on the drop overlay before the swap/restructure
   *  actually applies. */
  committing: boolean;
}

type DragState = ResizeDrag | SwapDrag;

export interface TileGridProps {
  /** Imperative request from the topbar to "Clear layout" (empty state). */
  clearSignal: number;
  /** Imperative request from Cmd+Z (undo previous layout edit). */
  undoSignal: number;
  /** Imperative request from Cmd+Shift+Z (redo previously-undone edit). */
  redoSignal: number;
  /** Imperative request from the topbar to add a widget. */
  addSignal: { kind: WidgetKind; n: number } | null;
  /** Imperative request from Backspace / Delete to remove the focused tile. */
  removeFocusedSignal: number;
  /** Imperative request from the arrow keys to move focus spatially. */
  focusDirSignal: { dir: 'left' | 'right' | 'up' | 'down'; n: number } | null;
  /** Notify parent when layout changes — used for the palette's `maxInstances` check. */
  onLayoutChange?: (layout: LayoutState) => void;
  /** Notify parent when the user clicks `+ Add` from the in-grid empty state. */
  onRequestAdd: () => void;
}

/** Maximum size of the undo / redo history. */
const HISTORY_CAP = 50;

export function TileGrid({
  clearSignal,
  undoSignal,
  redoSignal,
  addSignal,
  removeFocusedSignal,
  focusDirSignal,
  onLayoutChange,
  onRequestAdd,
}: TileGridProps) {
  const { tweaks, performanceModeOn } = useDashboardChrome();
  const baseGap = tweaks.compactMode ? COMPACT_GAP : NORMAL_GAP;

  const [layout, setLayoutDirect] = useState<LayoutState>(loadLayout);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Bump the inter-tile gap while a swap drag is active so the
  // dashboard physically "makes room" for the dragged tile — the
  // tile-position transitions already in place animate the reflow.
  // Skip in performance mode where every layout transition is off.
  const swapDragging = drag?.kind === 'swap' && drag.active;
  const dragPolishOn = swapDragging && !performanceModeOn;
  const gap = dragPolishOn ? baseGap + DRAG_GAP_BUMP : baseGap;
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  // Undo / redo: every "structural" layout edit (add / remove / clear /
  // swap) pushes the *previous* layout onto `undoStack`. The redo stack
  // gets reset on a fresh edit, like every other text editor. Resize
  // (`setRatio`) and focus updates skip the history — they're noisy
  // continuous deltas, not discrete user intents.
  const undoStackRef = useRef<LayoutState[]>([]);
  const redoStackRef = useRef<LayoutState[]>([]);

  // rAF coalescing: pointermove fires at >120Hz on some setups; we
  // batch into the next animation frame so React only re-renders once
  // per paint.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  // ---- Hover-hold auto-commit state -------------------------------------
  // While a swap drag is active, if the user keeps the cursor still
  // over a valid drop target for `HOVER_HOLD_MS`, we commit the
  // swap/restructure mid-drag (blink the overlay first), then keep
  // dragging so they can chain edits in a single gesture. Tracked via
  // refs (not state) so a position-update re-render doesn't reset the
  // hold timer on every frame.
  const hoverHoldTimerRef = useRef<number | null>(null);
  const settleRef = useRef<{
    x: number;
    y: number;
    hoverId: string | null;
    hoverEdge: SplitEdge | null;
  }>({ x: 0, y: 0, hoverId: null, hoverEdge: null });
  // Mirror of the latest drag state for the timer callback to read at
  // fire time (the timer's closure captures the state at arm time,
  // which would be stale after subsequent pointermoves).
  const dragRef = useRef<DragState | null>(null);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  // Latch on `performanceModeOn` so the hover-hold logic inside the
  // drag effect can short-circuit without listing the boolean in its
  // deps (which would tear down + re-attach the pointer listeners).
  const perfModeOnRef = useRef(performanceModeOn);
  useEffect(() => {
    perfModeOnRef.current = performanceModeOn;
  }, [performanceModeOn]);

  /**
   * Set the layout AND push the previous one onto the undo stack.
   * `transient: true` skips the history (resize/focus). Both forms
   * accept a function or a value, mirroring `useState`'s setter.
   */
  type LayoutUpdater = LayoutState | ((prev: LayoutState) => LayoutState);
  const applyLayout = useCallback(
    (next: LayoutUpdater, opts: { transient?: boolean } = {}) => {
      setLayoutDirect((prev) => {
        const computed =
          typeof next === 'function'
            ? (next as (p: LayoutState) => LayoutState)(prev)
            : next;
        if (computed === prev) return prev;
        if (!opts.transient) {
          const stack = undoStackRef.current;
          stack.push(prev);
          if (stack.length > HISTORY_CAP) stack.shift();
          // A fresh edit invalidates the redo branch.
          redoStackRef.current = [];
        }
        return computed;
      });
    },
    [],
  );


  // ---- Track grid size with ResizeObserver ------------------------------
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () =>
      setGridSize((prev) => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The dashboard-local origin for tile rects — `gap` from each outer
  // edge so tiles never butt against the dashboard border. In compact
  // mode `gap === 0` so tiles fill every pixel.
  const outerRect = useMemo(
    () => ({
      x: gap,
      y: gap,
      w: Math.max(0, gridSize.w - 2 * gap),
      h: Math.max(0, gridSize.h - 2 * gap),
    }),
    [gridSize.w, gridSize.h, gap],
  );

  const computed = useMemo(
    () => computeLayoutRects(layout.tree, outerRect, gap),
    [layout.tree, outerRect, gap],
  );

  // ---- Persist + notify parent on layout change --------------------------
  useEffect(() => {
    saveLayout(layout);
    onLayoutChange?.(layout);
    // Reflect the new layout in the URL so sharing / pasting copies it
    // verbatim. `scheduleUrlUpdate` debounces internally, so rapid
    // consecutive changes (e.g. mid-resize) only produce one URL write.
    scheduleUrlUpdate();
  }, [layout, onLayoutChange]);

  // ---- Topbar imperatives ------------------------------------------------
  const lastClearRef = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal === lastClearRef.current) return;
    lastClearRef.current = clearSignal;
    applyLayout({ tiles: {}, tree: null, focusId: null });
    setMaximized(null);
  }, [clearSignal, applyLayout]);

  // Cmd+Z — pop the previous layout off `undoStack`, push the current
  // one onto the redo stack. Transient (no new history entry).
  const lastUndoRef = useRef(undoSignal);
  useEffect(() => {
    if (undoSignal === lastUndoRef.current) return;
    lastUndoRef.current = undoSignal;
    setLayoutDirect((cur) => {
      const stack = undoStackRef.current;
      const prev = stack.pop();
      if (!prev) return cur;
      const redo = redoStackRef.current;
      redo.push(cur);
      if (redo.length > HISTORY_CAP) redo.shift();
      return prev;
    });
    setMaximized(null);
  }, [undoSignal]);

  // Cmd+Shift+Z — symmetric.
  const lastRedoRef = useRef(redoSignal);
  useEffect(() => {
    if (redoSignal === lastRedoRef.current) return;
    lastRedoRef.current = redoSignal;
    setLayoutDirect((cur) => {
      const redo = redoStackRef.current;
      const next = redo.pop();
      if (!next) return cur;
      const undo = undoStackRef.current;
      undo.push(cur);
      if (undo.length > HISTORY_CAP) undo.shift();
      return next;
    });
    setMaximized(null);
  }, [redoSignal]);

  // ---- Add a tile ------------------------------------------------------
  // Hyprland's dwindle convention: split the focused leaf along its
  // longer axis. A wide tile splits into left/right (`row` dir); a tall
  // tile splits into top/bottom (`col` dir). This keeps the resulting
  // children roughly square instead of always shoving new tiles to the
  // right regardless of the focused tile's aspect.
  const addTile = useCallback(
    (kind: WidgetKind) => {
      applyLayout((l) => {
        const def = WIDGETS[kind];
        if (def.maxInstances != null && countByKind(l, kind) >= def.maxInstances) {
          return l;
        }
        let splitDir: 'row' | 'col' = 'row';
        const targetId =
          (l.focusId && findPath(l.tree, l.focusId)
            ? l.focusId
            : rightmostLeafId(l.tree)) ?? null;
        if (targetId && l.tree && outerRect.w > 0 && outerRect.h > 0) {
          const sub = computeLayoutRects(l.tree, outerRect, gap);
          const target = sub.leaves.find((leaf) => leaf.id === targetId);
          if (target && target.rect.h > 0) {
            splitDir = target.rect.w >= target.rect.h ? 'row' : 'col';
          }
        }
        return addTileToLayout(l, kind, { splitDir });
      });
    },
    [gap, outerRect, applyLayout],
  );

  const lastAddNRef = useRef<number>(addSignal?.n ?? 0);
  useEffect(() => {
    if (!addSignal) return;
    if (addSignal.n === lastAddNRef.current) return;
    lastAddNRef.current = addSignal.n;
    addTile(addSignal.kind);
  }, [addSignal, addTile]);

  // ---- Tile actions ------------------------------------------------------
  const removeTile = useCallback(
    (id: string) => {
      applyLayout((l) => removeTileFromLayout(l, id));
      setMaximized((m) => (m === id ? null : m));
    },
    [applyLayout],
  );

  // Backspace / Delete — pop the focused tile. Resolves the focused id
  // from the layout *at signal time* (not at handler-creation time) so
  // a stale focusId in the closure can't accidentally remove the wrong
  // tile after a swap.
  const lastRemoveNRef = useRef(removeFocusedSignal);
  useEffect(() => {
    if (removeFocusedSignal === lastRemoveNRef.current) return;
    lastRemoveNRef.current = removeFocusedSignal;
    setLayoutDirect((cur) => {
      if (!cur.focusId) return cur;
      const stack = undoStackRef.current;
      stack.push(cur);
      if (stack.length > HISTORY_CAP) stack.shift();
      redoStackRef.current = [];
      return removeTileFromLayout(cur, cur.focusId);
    });
    setMaximized(null);
  }, [removeFocusedSignal]);

  // `barsHidden` cycles through 'show' (default) / 'hideBars' /
  // 'hideHead' on each click. Widgets without an internal control bar
  // (e.g. Shell) skip the middle state — see `cycleBarMode` below.
  // Per-tile UI toggles are not "structural" edits, so they go through
  // `transient: true` to keep the undo stack focused on add/remove/clear.
  const cycleBarMode = useCallback((id: string) => {
    applyLayout(
      (l) => {
        const cur = l.tiles[id];
        if (!cur) return l;
        const def = WIDGETS[cur.kind];
        const next = nextBarMode(cur.barMode, def.hasControlBar !== false);
        return patchTile(l, id, { barMode: next });
      },
      { transient: true },
    );
  }, [applyLayout]);

  const toggleMax = useCallback((id: string) => {
    setMaximized((m) => (m === id ? null : id));
  }, []);

  // Arrow-key focus navigation. The active tile is the one whose centre
  // we project from; we pick the tile in the requested direction whose
  // centre minimises an "axis-aligned + perpendicular" cost (Euclidean
  // distance, but with perpendicular axis weighted lower so a slightly
  // off-axis neighbour is preferred over a far-but-on-axis one). If
  // there is no focused tile yet we just focus the leftmost / topmost.
  const lastFocusDirNRef = useRef(focusDirSignal?.n ?? 0);
  useEffect(() => {
    if (!focusDirSignal) return;
    if (focusDirSignal.n === lastFocusDirNRef.current) return;
    lastFocusDirNRef.current = focusDirSignal.n;
    const leaves = computed.leaves;
    if (leaves.length === 0) return;
    const dir = focusDirSignal.dir;
    const curId = layout.focusId;
    const cur = curId ? leaves.find((l) => l.id === curId) : null;
    const centreOf = (r: { x: number; y: number; w: number; h: number }) => ({
      x: r.x + r.w / 2,
      y: r.y + r.h / 2,
    });
    if (!cur) {
      // No current focus — anchor to the corner that matches the
      // direction (Right → leftmost tile, Down → topmost, etc.).
      const pick =
        dir === 'right' || dir === 'left'
          ? [...leaves].sort((a, b) => a.rect.x - b.rect.x)
          : [...leaves].sort((a, b) => a.rect.y - b.rect.y);
      const first = pick[0];
      if (first) {
        applyLayout((l) => (l.focusId === first.id ? l : { ...l, focusId: first.id }), {
          transient: true,
        });
      }
      return;
    }
    const c = centreOf(cur.rect);
    // Spatial pick: prefer candidates whose perpendicular extent
    // *overlaps* the current tile's extent (i.e. they share a row or
    // column with it), tie-breaking by the smallest axial gap.
    // Fall back to the centre-distance metric only when no candidate
    // overlaps — e.g. a Mirror tile that fills the left column should
    // win against a Shell tile that's diagonally below-left, because
    // Mirror's vertical span fully contains Logcat's. The previous
    // `axial + 2 * perp` cost picked Shell in that case because Shell's
    // centre was closer overall even though it didn't share a row.
    interface Cand {
      id: string;
      gap: number;
      overlap: number;
      centerDist: number;
    }
    let bestOverlap: Cand | null = null;
    let bestFallback: Cand | null = null;
    for (const leaf of leaves) {
      if (leaf.id === cur.id) continue;
      const r = leaf.rect;
      // Direction filter: candidate must lie *past* the current tile
      // along the requested axis (use the rect edge, not the centre,
      // so a tile that sits flush alongside the current one still
      // counts — its centre may not be past the current centre).
      let gap = 0;
      let inDir = false;
      if (dir === 'right') {
        gap = r.x - (cur.rect.x + cur.rect.w);
        inDir = gap > -1;
      } else if (dir === 'left') {
        gap = cur.rect.x - (r.x + r.w);
        inDir = gap > -1;
      } else if (dir === 'down') {
        gap = r.y - (cur.rect.y + cur.rect.h);
        inDir = gap > -1;
      } else {
        gap = cur.rect.y - (r.y + r.h);
        inDir = gap > -1;
      }
      if (!inDir) continue;
      // Perpendicular overlap with the current tile.
      let overlap: number;
      if (dir === 'left' || dir === 'right') {
        const top = Math.max(cur.rect.y, r.y);
        const bot = Math.min(cur.rect.y + cur.rect.h, r.y + r.h);
        overlap = Math.max(0, bot - top);
      } else {
        const lf = Math.max(cur.rect.x, r.x);
        const rt = Math.min(cur.rect.x + cur.rect.w, r.x + r.w);
        overlap = Math.max(0, rt - lf);
      }
      const p = centreOf(r);
      const centerDist = Math.hypot(p.x - c.x, p.y - c.y);
      const cand: Cand = { id: leaf.id, gap, overlap, centerDist };
      if (overlap > 0) {
        if (
          !bestOverlap ||
          // Larger overlap wins; ties go to the smaller axial gap.
          cand.overlap > bestOverlap.overlap + 0.5 ||
          (Math.abs(cand.overlap - bestOverlap.overlap) <= 0.5 && cand.gap < bestOverlap.gap)
        ) {
          bestOverlap = cand;
        }
      } else if (!bestFallback || cand.centerDist < bestFallback.centerDist) {
        bestFallback = cand;
      }
    }
    const best = bestOverlap ?? bestFallback;
    if (!best) return;
    const target = best.id;
    applyLayout((l) => (l.focusId === target ? l : { ...l, focusId: target }), {
      transient: true,
    });
  }, [focusDirSignal, computed.leaves, layout.focusId, applyLayout]);

  // ---- Drag dispatch -----------------------------------------------------
  const onMoveStart = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (maximized) return;
      // Don't start a swap drag if the click landed on a header button.
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      e.preventDefault();
      // Yank DOM focus off whatever widget body input had it (Shell
      // prompt, Logcat filter, …). Without this, clicking a tile head
      // to "select" the tile left the previous input still focused —
      // which made Dashboard-level shortcuts (Delete to remove tile,
      // arrow keys to move focus) silently skip themselves because
      // the `inEditable(activeElement)` guard fired.
      const ae = document.activeElement;
      if (
        ae instanceof HTMLInputElement ||
        ae instanceof HTMLTextAreaElement ||
        (ae instanceof HTMLElement && ae.isContentEditable)
      ) {
        ae.blur();
      }
      // Note: focus tracking lives on the layout itself; mark the
      // tile under the pointer as the next "+ Add" target.
      applyLayout(
        (l) => (l.focusId === id ? l : { ...l, focusId: id }),
        { transient: true },
      );
      setDrag({
        kind: 'swap',
        fromId: id,
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY,
        hoverId: null,
        hoverEdge: null,
        active: false,
        committing: false,
      });
    },
    [maximized, applyLayout],
  );

  const onSplitHandleStart = useCallback(
    (path: Array<'a' | 'b'>, axis: 'row' | 'col', innerLen: number, originRatio: number) =>
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (innerLen <= 0) return;
        setDrag({
          kind: 'resize',
          path,
          innerLen,
          originRatio,
          startX: e.clientX,
          startY: e.clientY,
          axis,
        });
      },
    [],
  );

  // ---- Drag loop ---------------------------------------------------------
  useEffect(() => {
    if (!drag) return;

    const flush = () => {
      rafRef.current = null;
      const fn = pendingRef.current;
      pendingRef.current = null;
      fn?.();
    };
    const schedule = (fn: () => void) => {
      pendingRef.current = fn;
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(flush);
      }
    };

    /** Edge band as a fraction of the tile *body*. The four edge
     *  bands surround a centre swap zone; 0.25 means a quarter on
     *  each side of the body with a 50% × 50% centre square left
     *  for swap. The head bar is excluded from the calculation
     *  (any drop on the head is unconditionally a swap), which
     *  matches the "header = grab handle" UX users carry over from
     *  IDEs. */
    const EDGE = 0.25;
    const hitTest = (
      x: number,
      y: number,
    ): { id: string | null; edge: SplitEdge | null } => {
      const grid = gridRef.current;
      if (!grid) return { id: null, edge: null };
      const els = document.elementsFromPoint(x, y);
      let tileEl: HTMLElement | null = null;
      let onHead = false;
      for (const el of els) {
        if (!grid.contains(el)) continue;
        if (!tileEl && (el as HTMLElement).closest('.tile-head')) {
          onHead = true;
        }
        const candidate = (el as HTMLElement).closest('[data-tile-id]') as HTMLElement | null;
        if (candidate) {
          tileEl = candidate;
          break;
        }
      }
      if (!tileEl) return { id: null, edge: null };
      const id = tileEl.dataset.tileId ?? null;
      if (!id) return { id: null, edge: null };
      // Drop on the head bar → always a swap. The drag UX picks the
      // tile up by its header, so dropping head-to-head is the
      // obvious "swap places" gesture.
      if (onHead) return { id, edge: null };

      // Compute the body region (full tile minus the head's height
      // when the head is present) and resolve the edge band against
      // the body, not the whole tile — otherwise the head's 34px
      // would land in the top edge zone for any tall tile.
      const rect = tileEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { id, edge: null };
      const headEl = tileEl.querySelector<HTMLElement>(':scope > .tile-head');
      const headHeight = headEl ? headEl.getBoundingClientRect().height : 0;
      const bodyTop = rect.top + headHeight;
      const bodyHeight = rect.height - headHeight;
      if (bodyHeight <= 0) return { id, edge: null };
      const relX = (x - rect.left) / rect.width;
      const relY = (y - bodyTop) / bodyHeight;

      // Distance to each edge as a fraction. Smallest distance picks
      // the edge band; ties (corners) resolve by axis priority left
      // / right / top / bottom in declaration order.
      const distLeft = relX;
      const distRight = 1 - relX;
      const distTop = relY;
      const distBottom = 1 - relY;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      let edge: SplitEdge | null = null;
      if (minDist < EDGE) {
        if (minDist === distLeft) edge = 'left';
        else if (minDist === distRight) edge = 'right';
        else if (minDist === distTop) edge = 'top';
        else edge = 'bottom';
      }
      return { id, edge };
    };

    // ---- Hover-hold auto-commit ---------------------------------------
    // Reads from refs (not closure-captured drag state) so it sees the
    // latest hover when the timer fires — the closure was created at
    // arm time, which is potentially seconds ago after a few intervening
    // pointermoves.
    const autoCommitFromHover = () => {
      hoverHoldTimerRef.current = null;
      const cur = dragRef.current;
      if (!cur || cur.kind !== 'swap') return;
      if (!cur.hoverId || cur.hoverId === cur.fromId) return;
      const fromId = cur.fromId;
      const targetId = cur.hoverId;
      const targetEdge = cur.hoverEdge;
      // Phase 1: blink the overlay (CSS animation triggered by the
      // `committing` flag) so the user sees confirmation before the
      // tiles slide around.
      setDrag((d) => (d && d.kind === 'swap' ? { ...d, committing: true } : d));
      window.setTimeout(() => {
        const latest = dragRef.current;
        // Commit when either (a) the drag is still active and the
        // hover hasn't drifted during the blink, or (b) the drag
        // has already ended (user released during the blink) — the
        // hover-hold authorisation should still apply rather than
        // being silently swallowed by the late release.
        const hoverIntact =
          latest == null ||
          (latest.kind === 'swap' &&
            latest.hoverId === targetId &&
            latest.hoverEdge === targetEdge);
        if (hoverIntact) {
          applyLayout((l) =>
            targetEdge
              ? restructureTile(l, fromId, targetId, targetEdge)
              : swapTiles(l, fromId, targetId),
          );
        }
        // Reset hover + committing on the drag so another auto-commit
        // requires a fresh hover. The settle anchor is also reset so
        // the next arm waits for the user to actually move first
        // (otherwise the immediately-following pointermove with the
        // same coordinates would rearm the timer).
        setDrag((d) =>
          d && d.kind === 'swap'
            ? { ...d, hoverId: null, hoverEdge: null, committing: false }
            : d,
        );
        settleRef.current = { ...settleRef.current, hoverId: null, hoverEdge: null };
      }, 180);
    };

    const onMove = (e: PointerEvent) => {
      if (drag.kind === 'resize') {
        const dPx = drag.axis === 'row' ? e.clientX - drag.startX : e.clientY - drag.startY;
        const dRatio = drag.innerLen > 0 ? dPx / drag.innerLen : 0;
        const nextRatio = Math.max(
          MIN_RATIO,
          Math.min(MAX_RATIO, drag.originRatio + dRatio),
        );
        schedule(() =>
          applyLayout((l) => setRatio(l, drag.path, nextRatio), {
            transient: true,
          }),
        );
        return;
      }
      // swap drag — overlay-preview semantics: the layout itself
      // doesn't mutate during the drag; we just track which tile
      // (and which of its body edges) the cursor is over and render
      // a translucent highlight there. The drop step is the only
      // moment we apply `swapTiles` / `restructureTile`. This
      // matches the prior-art (IntelliJ tool windows, VS Code
      // editor groups) and avoids the cross-the-boundary flicker
      // that a live-mutation model produces when the user lingers
      // near a zone edge.
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const active = drag.active || Math.hypot(dx, dy) > 5;
      const probe = active
        ? hitTest(e.clientX, e.clientY)
        : { id: null as string | null, edge: null as SplitEdge | null };
      const targetId = probe.id;
      const edge = targetId && targetId !== drag.fromId ? probe.edge : null;
      schedule(() => {
        setDrag((d) =>
          d && d.kind === 'swap'
            ? {
                ...d,
                curX: e.clientX,
                curY: e.clientY,
                hoverId: targetId,
                hoverEdge: edge,
                active,
              }
            : d,
        );
      });
      // Hover-hold tracking. Skip in performance mode (the whole
      // drag-polish bundle — shake, wider gap, mid-drag commit — is
      // gated on the user *not* opting out of layout transitions).
      if (!perfModeOnRef.current) {
        const settle = settleRef.current;
        const moved = Math.hypot(e.clientX - settle.x, e.clientY - settle.y) > 3;
        const hoverChanged =
          targetId !== settle.hoverId || edge !== settle.hoverEdge;
        if (moved || hoverChanged) {
          if (hoverHoldTimerRef.current != null) {
            window.clearTimeout(hoverHoldTimerRef.current);
            hoverHoldTimerRef.current = null;
          }
          settleRef.current = {
            x: e.clientX,
            y: e.clientY,
            hoverId: targetId,
            hoverEdge: edge,
          };
        }
        const validDrop = active && !!targetId && targetId !== drag.fromId;
        if (validDrop && hoverHoldTimerRef.current == null) {
          hoverHoldTimerRef.current = window.setTimeout(
            autoCommitFromHover,
            HOVER_HOLD_MS,
          );
        } else if (!validDrop && hoverHoldTimerRef.current != null) {
          window.clearTimeout(hoverHoldTimerRef.current);
          hoverHoldTimerRef.current = null;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        pendingRef.current?.();
        pendingRef.current = null;
      }
      // Cancel any pending hover-hold so it doesn't fire after release.
      if (hoverHoldTimerRef.current != null) {
        window.clearTimeout(hoverHoldTimerRef.current);
        hoverHoldTimerRef.current = null;
      }
      if (drag.kind === 'swap') {
        // If a hover-hold blink is in flight, skip the pointerup
        // commit so we don't apply the same swap twice. The deferred
        // commit inside `autoCommitFromHover` will fire on its own.
        const committingNow =
          dragRef.current && dragRef.current.kind === 'swap'
            ? dragRef.current.committing
            : false;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!committingNow && Math.hypot(dx, dy) > 5) {
          const probe = hitTest(e.clientX, e.clientY);
          const target = probe.id;
          const edge = probe.edge;
          if (target && target !== drag.fromId) {
            if (edge) {
              applyLayout((l) => restructureTile(l, drag.fromId, target, edge));
            } else {
              applyLayout((l) => swapTiles(l, drag.fromId, target));
            }
          }
        }
      }
      setDrag(null);
      settleRef.current = { x: 0, y: 0, hoverId: null, hoverEdge: null };
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // The hover-hold timer is intentionally *not* cleared here. The
      // drag effect re-runs on every drag-state change (every
      // pointermove during rAF flush), so clearing the timer here
      // would reset the hover-hold every frame and the auto-commit
      // would never fire. The timer is cleared explicitly on:
      //   - pointer up
      //   - significant cursor move / hover change (in `onMove`)
      //   - commit (in `autoCommitFromHover`)
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [drag, applyLayout]);

  // ---- Render ------------------------------------------------------------
  const gridClass = useMemo(() => {
    return [
      'dash-grid',
      drag?.kind === 'resize' && 'dragging',
      drag?.kind === 'swap' && drag.active && 'swap-dragging',
      // `polish` is the "iOS-icon-shake + roomier gap" class. The
      // swap-dragging class above stays in place because some
      // unrelated rules (cursor, user-select) still want to fire in
      // performance mode.
      dragPolishOn && 'drag-polish',
      maximized && 'has-max',
    ]
      .filter(Boolean)
      .join(' ');
  }, [drag, maximized, dragPolishOn]);

  const swapDrag = drag?.kind === 'swap' && drag.active ? drag : null;

  // Look up each split's current ratio (for the resize-drag origin).
  const ratioAtPath = useCallback(
    (path: Array<'a' | 'b'>): number => {
      let n = layout.tree;
      for (const step of path) {
        if (!n || n.type !== 'split') return 0.5;
        n = step === 'a' ? n.a : n.b;
      }
      return n && n.type === 'split' ? n.ratio : 0.5;
    },
    [layout.tree],
  );

  return (
    <div ref={gridRef} className={gridClass}>
      {layout.tree
        ? computed.leaves.map(({ id, rect }) => {
            const tile = layout.tiles[id];
            if (!tile) return null;
            const def = WIDGETS[tile.kind];
            const Comp = def.comp;
            const isMax = maximized === id;
            // The drop-target visual is now the `<DropOverlay/>` slab
            // (full tile for centre/swap, half-tile slab for edge
            // splits). Skip the `.tile.drop-target` outline entirely
            // so the two cues don't double up.
            const isHover = false;
            const isSource = swapDrag?.fromId === id;
            // Maximised tiles use the same `left/top/width/height` set as
            // non-maximised tiles (pixel values, not `right/bottom: 0`) so
            // the CSS transition on those four properties interpolates
            // both corners. Mixing `right/bottom: 0` with the
            // non-maximised `width/height` would leave width/height
            // unanimated, which made the bottom-right edge snap to the
            // corner instead of glide there.
            const style: CSSProperties = isMax
              ? {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: gridSize.w,
                  height: gridSize.h,
                  zIndex: 30,
                }
              : {
                  position: 'absolute',
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                };
            return (
              <Tile
                key={id}
                tile={tile}
                maximized={isMax}
                dragging={isSource ?? false}
                dropTarget={isHover ?? false}
                focused={layout.focusId === id}
                style={style}
                onMoveStart={onMoveStart(id)}
                onCycleBarMode={() => cycleBarMode(id)}
                onToggleMax={() => toggleMax(id)}
                onRemove={() => removeTile(id)}
              >
                <Comp tileId={id} />
              </Tile>
            );
          })
        : null}

      {layout.tree
        ? computed.splits.map(({ key, path, dir, handleRect, innerLen }) => (
            <SplitHandle
              key={key}
              dir={dir}
              rect={handleRect}
              gap={gap}
              onPointerDown={onSplitHandleStart(path, dir, innerLen, ratioAtPath(path))}
            />
          ))
        : null}

      {!layout.tree && (
        <div className="dash-empty">
          <Icons.Layout size={28} />
          <h3>Empty dashboard</h3>
          <p>Add a widget to begin monitoring this device.</p>
          <button className="dash-empty-btn" onClick={onRequestAdd}>
            <Icons.Plus size={13} /> Add widget
          </button>
        </div>
      )}

      {swapDrag && swapDrag.hoverId && swapDrag.fromId !== swapDrag.hoverId &&
        (() => {
          const targetRect = computed.leaves.find(
            (l) => l.id === swapDrag.hoverId,
          )?.rect;
          if (!targetRect) return null;
          return (
            <DropOverlay
              rect={targetRect}
              edge={swapDrag.hoverEdge}
              committing={swapDrag.committing}
            />
          );
        })()}

      {swapDrag && layout.tiles[swapDrag.fromId] && (
        <SwapGhost
          tileKind={layout.tiles[swapDrag.fromId].kind}
          x={swapDrag.curX}
          y={swapDrag.curY}
        />
      )}
    </div>
  );
}

interface SplitHandleProps {
  dir: 'row' | 'col';
  rect: { x: number; y: number; w: number; h: number };
  gap: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * The seam between two siblings — drag to resize. We expand the actual
 * pointer-target box past the visible gap so users can grab it even when
 * `gap === 0` (compact mode); the visible "fill" stays inside the gap
 * itself via the `.dash-split-handle::before` pseudo.
 */
function SplitHandle({ dir, rect, gap, onPointerDown }: SplitHandleProps) {
  // In compact mode (`gap === 0`) the handle has no width along the
  // resize axis — give it a 6px hit-zone overlapping each neighbour by
  // 3px so it stays grabbable.
  const HIT = 6;
  const overlap = gap === 0 ? HIT / 2 : 0;
  const style: CSSProperties =
    dir === 'row'
      ? {
          position: 'absolute',
          left: rect.x - overlap,
          top: rect.y,
          width: rect.w + overlap * 2,
          height: rect.h,
        }
      : {
          position: 'absolute',
          left: rect.x,
          top: rect.y - overlap,
          width: rect.w,
          height: rect.h + overlap * 2,
        };
  return (
    <div
      className={`dash-split-handle dash-split-handle--${dir}`}
      style={style}
      onPointerDown={onPointerDown}
      aria-label="Resize split"
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
    >
      <div className="dash-split-line" aria-hidden />
    </div>
  );
}

interface DropOverlayProps {
  rect: { x: number; y: number; w: number; h: number };
  edge: SplitEdge | null;
  /** True for the brief blink window between hover-hold trigger and
   *  the actual swap/restructure firing. */
  committing: boolean;
}

/**
 * Translucent highlight rendered on top of the drop-target tile during
 * a swap drag. Communicates where the dragged tile would land:
 *   - `edge === null`           → the whole target (swap in place).
 *   - `'left'` / `'right'`      → the corresponding 50% horizontal
 *                                 slab (target ends up on the other
 *                                 side).
 *   - `'top'` / `'bottom'`      → the corresponding 50% vertical slab.
 *
 * The render is purely cosmetic — the underlying layout stays
 * untouched until the pointer-up handler commits the move. That's
 * what keeps the UX from flickering between layouts as the cursor
 * crosses zone boundaries.
 */
function DropOverlay({ rect, edge, committing }: DropOverlayProps) {
  let left = rect.x;
  let top = rect.y;
  let width = rect.w;
  let height = rect.h;
  if (edge === 'left') {
    width = rect.w / 2;
  } else if (edge === 'right') {
    left = rect.x + rect.w / 2;
    width = rect.w / 2;
  } else if (edge === 'top') {
    height = rect.h / 2;
  } else if (edge === 'bottom') {
    top = rect.y + rect.h / 2;
    height = rect.h / 2;
  }
  return (
    <div
      className={`dash-drop-overlay ${committing ? 'dash-drop-overlay-committing' : ''}`}
      style={{ left, top, width, height }}
      aria-hidden
    />
  );
}

interface SwapGhostProps {
  tileKind: WidgetKind;
  x: number;
  y: number;
}

function SwapGhost({ tileKind, x, y }: SwapGhostProps) {
  const def = WIDGETS[tileKind];
  const Icon = def.icon;
  return (
    <div
      className="dash-swap-ghost"
      style={{ left: x, top: y }}
      aria-hidden
    >
      <Icon size={12} />
      <span>{def.name}</span>
    </div>
  );
}
