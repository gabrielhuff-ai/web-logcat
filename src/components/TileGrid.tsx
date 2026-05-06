// Tile grid — renders the dwindle (Hyprland-style) binary-tree layout
// as nested flex containers. Owns the live `layout` state, the in-flight
// resize / swap drag, the maximised id, and persists changes to
// localStorage.
//
// There is no scroll: the grid is a fixed-size viewport and every tile's
// share of that viewport is implied by the tree (each split node carves
// its parent area along one axis at a configurable ratio). Adding a
// tile splits the focused leaf in two; removing collapses the parent
// split into the surviving sibling. Resize handles live at the seam
// between two siblings — dragging changes that split's ratio.
//
// Tiles are rearranged by drag-to-swap: pick up a tile by its header,
// drop it on another tile, and their leaf ids swap positions.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Tile } from './Tile';
import * as Icons from './Icons';
import { WIDGETS } from '../lib/widgets';
import {
  defaultLayout,
  loadLayout,
  patchTile,
  removeTile as removeTileFromLayout,
  saveLayout,
  setFocus,
  setRatio,
  swapTiles,
  addTile as addTileToLayout,
  countByKind,
  MIN_RATIO,
  MAX_RATIO,
} from '../lib/layout';
import type { LayoutNode, LayoutState, WidgetKind } from '../types';

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

interface ResizeDrag {
  kind: 'resize';
  /** Path from the root to the split being resized. */
  path: Array<'a' | 'b'>;
  /** Pixel size of the split's container along the relevant axis. */
  containerPx: number;
  /** Ratio at the start of the drag — used as the origin for delta math. */
  originRatio: number;
  /** Pointer position at drag start. */
  startX: number;
  startY: number;
  /** Axis being resized. */
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

export function TileGrid({
  resetSignal,
  addSignal,
  onLayoutChange,
  onRequestAdd,
}: TileGridProps) {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // rAF coalescing: pointermove fires at >120Hz on some setups; we
  // batch into the next animation frame so React only re-renders once
  // per paint.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

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

  const addTile = useCallback(
    (kind: WidgetKind) => {
      setLayout((l) => {
        const def = WIDGETS[kind];
        if (def.maxInstances != null && countByKind(l, kind) >= def.maxInstances) {
          return l;
        }
        const grid = gridRef.current;
        const aspect = grid && grid.clientHeight > 0 ? grid.clientWidth / grid.clientHeight : 16 / 9;
        return addTileToLayout(l, kind, { viewportAspect: aspect });
      });
    },
    [],
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

  const focusTile = useCallback((id: string) => {
    setLayout((l) => setFocus(l, id));
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
      focusTile(id);
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
    [focusTile, maximized],
  );

  const onSplitHandleStart = useCallback(
    (path: Array<'a' | 'b'>, axis: 'row' | 'col') =>
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const handle = e.currentTarget as HTMLElement;
        const container = handle.parentElement;
        if (!container) return;
        const containerPx =
          axis === 'row' ? container.clientWidth : container.clientHeight;
        if (containerPx <= 0) return;
        // Walk to the split node we're resizing.
        let node: LayoutNode | null = layout.tree;
        for (const step of path) {
          if (!node || node.type !== 'split') {
            node = null;
            break;
          }
          node = step === 'a' ? node.a : node.b;
        }
        if (!node || node.type !== 'split') return;
        setDrag({
          kind: 'resize',
          path,
          containerPx,
          originRatio: node.ratio,
          startX: e.clientX,
          startY: e.clientY,
          axis,
        });
      },
    [layout.tree],
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
        const dRatio = dPx / drag.containerPx;
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
      // Don't go through React for the floating ghost — mutate the local
      // drag state and let the next render catch up.
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

  // Hide non-maximized tiles when one is maximized.
  const renderNode = (node: LayoutNode, path: Array<'a' | 'b'>): ReactNode => {
    if (node.type === 'leaf') {
      const tile = layout.tiles[node.id];
      if (!tile) return null;
      const def = WIDGETS[tile.kind];
      const Comp = def.comp;
      const isMax = maximized === tile.id;
      const isHover = swapDrag?.hoverId === tile.id && swapDrag.fromId !== tile.id;
      const isSource = swapDrag?.fromId === tile.id;
      // When something is maximized, the maximized tile is rendered separately
      // (positioned absolutely on top); other leaves render but are visually
      // hidden by the `.has-max` rule.
      const style: CSSProperties = isMax
        ? {
            position: 'absolute',
            inset: 0,
            zIndex: 30,
          }
        : { flex: '1 1 0%', minWidth: 0, minHeight: 0 };
      return (
        <Tile
          key={tile.id}
          tile={tile}
          maximized={isMax}
          dragging={isSource ?? false}
          dropTarget={isHover ?? false}
          focused={layout.focusId === tile.id}
          style={style}
          onMoveStart={onMoveStart(tile.id)}
          onToggleBars={() => toggleBars(tile.id)}
          onToggleMax={() => toggleMax(tile.id)}
          onRemove={() => removeTile(tile.id)}
        >
          <Comp tileId={tile.id} />
        </Tile>
      );
    }
    // Split node — nested flex container with a resize handle between
    // its children.
    const dirClass = node.dir === 'row' ? 'dash-split row' : 'dash-split col';
    const aPct = node.ratio * 100;
    const bPct = (1 - node.ratio) * 100;
    return (
      <div
        key={path.join('') || 'root'}
        className={dirClass}
        style={{
          flex: '1 1 0%',
          display: 'flex',
          flexDirection: node.dir === 'row' ? 'row' : 'column',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          className="dash-split-pane"
          style={{
            flex: `${aPct} ${aPct} 0%`,
            display: 'flex',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {renderNode(node.a, [...path, 'a'])}
        </div>
        <div
          className={`dash-split-handle ${node.dir}`}
          onPointerDown={onSplitHandleStart(path, node.dir)}
          aria-label="Resize split"
          role="separator"
          aria-orientation={node.dir === 'row' ? 'vertical' : 'horizontal'}
        />
        <div
          className="dash-split-pane"
          style={{
            flex: `${bPct} ${bPct} 0%`,
            display: 'flex',
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {renderNode(node.b, [...path, 'b'])}
        </div>
      </div>
    );
  };

  return (
    <div ref={gridRef} className={gridClass}>
      {layout.tree ? (
        renderNode(layout.tree, [])
      ) : (
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
