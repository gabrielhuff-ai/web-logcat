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
  defaultLayout,
  findPath,
  loadLayout,
  patchTile,
  removeTile as removeTileFromLayout,
  rightmostLeafId,
  saveLayout,
  setRatio,
  swapTiles,
  addTile as addTileToLayout,
  countByKind,
  MIN_RATIO,
  MAX_RATIO,
} from '../lib/layout';
import { useDashboardChrome } from '../lib/dashboardChrome';
import type { LayoutState, WidgetKind } from '../types';

/** Inter-tile gap in pixels (also the seam-handle thickness). */
const NORMAL_GAP = 10;
const COMPACT_GAP = 0;

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
  /** True once the cursor has moved more than a few px from the start. */
  active: boolean;
}

type DragState = ResizeDrag | SwapDrag;

export interface TileGridProps {
  /** Imperative request from the topbar to "Reset layout". */
  resetSignal: number;
  /** Imperative request from the topbar to add a widget. */
  addSignal: { kind: WidgetKind; n: number } | null;
  /** Notify parent when layout changes — used for the palette's `maxInstances` check. */
  onLayoutChange?: (layout: LayoutState) => void;
  /** Notify parent when the user clicks `+ Add` from the in-grid empty state. */
  onRequestAdd: () => void;
}

export function TileGrid({
  resetSignal,
  addSignal,
  onLayoutChange,
  onRequestAdd,
}: TileGridProps) {
  const { tweaks } = useDashboardChrome();
  const gap = tweaks.compactMode ? COMPACT_GAP : NORMAL_GAP;

  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  // rAF coalescing: pointermove fires at >120Hz on some setups; we
  // batch into the next animation frame so React only re-renders once
  // per paint.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

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
  }, [layout, onLayoutChange]);

  // ---- Topbar imperatives ------------------------------------------------
  const lastResetRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastResetRef.current) return;
    lastResetRef.current = resetSignal;
    setLayout(defaultLayout());
    setMaximized(null);
  }, [resetSignal]);

  // ---- Add a tile ------------------------------------------------------
  // Hyprland's dwindle convention: split the focused leaf along its
  // longer axis. A wide tile splits into left/right (`row` dir); a tall
  // tile splits into top/bottom (`col` dir). This keeps the resulting
  // children roughly square instead of always shoving new tiles to the
  // right regardless of the focused tile's aspect.
  const addTile = useCallback(
    (kind: WidgetKind) => {
      setLayout((l) => {
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
    [gap, outerRect],
  );

  const lastAddNRef = useRef<number>(addSignal?.n ?? 0);
  useEffect(() => {
    if (!addSignal) return;
    if (addSignal.n === lastAddNRef.current) return;
    lastAddNRef.current = addSignal.n;
    addTile(addSignal.kind);
  }, [addSignal, addTile]);

  // ---- Tile actions ------------------------------------------------------
  const removeTile = useCallback((id: string) => {
    setLayout((l) => removeTileFromLayout(l, id));
    setMaximized((m) => (m === id ? null : m));
  }, []);

  const toggleBars = useCallback((id: string) => {
    setLayout((l) => {
      const cur = l.tiles[id];
      if (!cur) return l;
      return patchTile(l, id, { barsHidden: !cur.barsHidden });
    });
  }, []);

  const toggleMax = useCallback((id: string) => {
    setMaximized((m) => (m === id ? null : id));
  }, []);

  // ---- Drag dispatch -----------------------------------------------------
  const onMoveStart = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (maximized) return;
      // Don't start a swap drag if the click landed on a header button.
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      e.preventDefault();
      // Note: focus tracking lives on the layout itself; mark the
      // tile under the pointer as the next "+ Add" target.
      setLayout((l) => (l.focusId === id ? l : { ...l, focusId: id }));
      setDrag({
        kind: 'swap',
        fromId: id,
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY,
        hoverId: null,
        active: false,
      });
    },
    [maximized],
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

    const hitTest = (x: number, y: number): string | null => {
      const grid = gridRef.current;
      if (!grid) return null;
      const els = document.elementsFromPoint(x, y);
      for (const el of els) {
        if (!grid.contains(el)) continue;
        const tileEl = (el as HTMLElement).closest('[data-tile-id]') as HTMLElement | null;
        if (tileEl) return tileEl.dataset.tileId ?? null;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      if (drag.kind === 'resize') {
        const dPx = drag.axis === 'row' ? e.clientX - drag.startX : e.clientY - drag.startY;
        const dRatio = drag.innerLen > 0 ? dPx / drag.innerLen : 0;
        const nextRatio = Math.max(
          MIN_RATIO,
          Math.min(MAX_RATIO, drag.originRatio + dRatio),
        );
        schedule(() => setLayout((l) => setRatio(l, drag.path, nextRatio)));
        return;
      }
      // swap drag
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const active = drag.active || Math.hypot(dx, dy) > 5;
      const hoverId = active ? hitTest(e.clientX, e.clientY) : null;
      schedule(() => {
        setDrag((d) =>
          d && d.kind === 'swap'
            ? { ...d, curX: e.clientX, curY: e.clientY, hoverId, active }
            : d,
        );
      });
    };

    const onUp = (e: PointerEvent) => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        pendingRef.current?.();
        pendingRef.current = null;
      }
      if (drag.kind === 'swap') {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.hypot(dx, dy) > 5) {
          const target = hitTest(e.clientX, e.clientY);
          if (target && target !== drag.fromId) {
            setLayout((l) => swapTiles(l, drag.fromId, target));
          }
        }
      }
      setDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [drag]);

  // ---- Render ------------------------------------------------------------
  const gridClass = useMemo(() => {
    return [
      'dash-grid',
      drag?.kind === 'resize' && 'dragging',
      drag?.kind === 'swap' && drag.active && 'swap-dragging',
      maximized && 'has-max',
    ]
      .filter(Boolean)
      .join(' ');
  }, [drag, maximized]);

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
            const isHover = swapDrag?.hoverId === id && swapDrag.fromId !== id;
            const isSource = swapDrag?.fromId === id;
            const style: CSSProperties = isMax
              ? {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
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
                onToggleBars={() => toggleBars(id)}
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
      className={`dash-split-handle ${dir}`}
      style={style}
      onPointerDown={onPointerDown}
      aria-label="Resize split"
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
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
