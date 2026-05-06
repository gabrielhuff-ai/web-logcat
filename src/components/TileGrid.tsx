// Tile grid — owns the live `layout` state, in-flight drag/resize, the
// maximized id, and persists changes to localStorage.
//
// Drag math: pointer events on the tile header / corner; pixel deltas
// are translated into integer cell deltas via `lib/layout.ts`. We use
// rAF to coalesce moves so a fast drag doesn't drown React in updates.
//
// We deliberately do NOT use `react-grid-layout`. The HANDOFF and
// CLAUDE.md both call this out: a 200-line plain-pointer implementation
// keeps the dependency surface tiny and matches the reference design
// exactly (snap to integer cells, no rearranging-on-overlap, etc.).

import {
  useCallback,
  useEffect,
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
  COLS,
  GAP,
  PHASE_6_DEFAULT_LAYOUT,
  ROW_PX,
  colWidth,
  loadLayout,
  nextTileId,
  placeBelow,
  saveLayout,
  snapMove,
  snapResize,
  totalRows,
} from '../lib/layout';
import type { LayoutState, Tile as TileT, WidgetKind } from '../types';

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

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
}

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
  const pendingPatchRef = useRef<{ id: string; patch: Partial<TileT> } | null>(null);

  // ---- Persist + notify parent on layout change --------------------------
  useEffect(() => {
    saveLayout(layout);
    onLayoutChange?.(layout);
  }, [layout, onLayoutChange]);

  // ---- Topbar imperatives ------------------------------------------------
  // Reset signal: the parent bumps a counter; we react by resetting layout.
  // Skip the very first render so the initial mount doesn't blow away the
  // user's persisted layout.
  const lastResetRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastResetRef.current) return;
    lastResetRef.current = resetSignal;
    setLayout(PHASE_6_DEFAULT_LAYOUT);
    setMaximized(null);
  }, [resetSignal]);

  const lastAddNRef = useRef<number>(addSignal?.n ?? 0);
  useEffect(() => {
    if (!addSignal) return;
    if (addSignal.n === lastAddNRef.current) return;
    lastAddNRef.current = addSignal.n;
    addTile(addSignal.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSignal]);

  const updateTile = useCallback((id: string, patch: Partial<TileT>) => {
    setLayout((l) => l.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const addTile = useCallback((kind: WidgetKind) => {
    const def = WIDGETS[kind];
    setLayout((l) => {
      // Respect `maxInstances` defensively — `WidgetPalette` already
      // disables the card, but a stale signal could still get here.
      if (def.maxInstances != null) {
        const count = l.filter((t) => t.kind === kind).length;
        if (count >= def.maxInstances) return l;
      }
      const pos = placeBelow(l, def.defaultSize.w);
      const id = nextTileId();
      return [
        ...l,
        { id, kind, x: pos.x, y: pos.y, w: def.defaultSize.w, h: def.defaultSize.h },
      ];
    });
  }, []);

  const removeTile = useCallback((id: string) => {
    setLayout((l) => l.filter((t) => t.id !== id));
    setMaximized((m) => (m === id ? null : m));
  }, []);

  const toggleBars = useCallback((id: string) => {
    setLayout((l) =>
      l.map((t) => (t.id === id ? { ...t, barsHidden: !t.barsHidden } : t)),
    );
  }, []);

  const toggleMax = useCallback((id: string) => {
    setMaximized((m) => (m === id ? null : id));
  }, []);

  // ---- Drag / resize loop ------------------------------------------------
  const onMoveStart = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const tile = layout.find((t) => t.id === id);
      if (!tile) return;
      setDrag({
        id,
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
      });
    },
    [layout],
  );

  const onResizeStart = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const tile = layout.find((t) => t.id === id);
      if (!tile) return;
      setDrag({
        id,
        mode: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
      });
    },
    [layout],
  );

  useEffect(() => {
    if (!drag) return;
    const grid = gridRef.current;
    if (!grid) return;
    const cw = colWidth(grid.clientWidth);

    const flush = () => {
      rafRef.current = null;
      const p = pendingPatchRef.current;
      if (!p) return;
      pendingPatchRef.current = null;
      updateTile(p.id, p.patch);
    };

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      let patch: Partial<TileT>;
      if (drag.mode === 'move') {
        patch = snapMove(drag.origin, dx, dy, cw);
      } else {
        patch = snapResize(drag.origin, dx, dy, cw);
      }
      pendingPatchRef.current = { id: drag.id, patch };
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(flush);
      }
    };
    const onUp = () => {
      // Final flush in case a pending patch is still queued when the user
      // releases — skipping this would leave the tile snapped to its
      // second-to-last position.
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        flush();
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
  }, [drag, updateTile]);

  // ---- Render ------------------------------------------------------------
  const rows = totalRows(layout);
  const tileStyle = useCallback(
    (t: TileT): CSSProperties => {
      if (maximized === t.id) {
        return {
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 'auto',
          height: 'auto',
          zIndex: 30,
        };
      }
      return {
        gridColumn: `${t.x + 1} / span ${t.w}`,
        gridRow: `${t.y + 1} / span ${t.h}`,
      };
    },
    [maximized],
  );

  const gridClass = useMemo(() => {
    return [
      'dash-grid',
      drag && 'dragging',
      maximized && 'has-max',
    ]
      .filter(Boolean)
      .join(' ');
  }, [drag, maximized]);

  return (
    <div
      ref={gridRef}
      className={gridClass}
      style={{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, ${ROW_PX}px)`,
        gap: GAP,
      }}
    >
      {layout.map((t) => {
        const def = WIDGETS[t.kind];
        const Comp = def.comp;
        return (
          <Tile
            key={t.id}
            tile={t}
            maximized={maximized === t.id}
            dragging={drag?.id === t.id}
            style={tileStyle(t)}
            onMoveStart={onMoveStart(t.id)}
            onResizeStart={onResizeStart(t.id)}
            onToggleBars={() => toggleBars(t.id)}
            onToggleMax={() => toggleMax(t.id)}
            onRemove={() => removeTile(t.id)}
          >
            <Comp tileId={t.id} />
          </Tile>
        );
      })}

      {layout.length === 0 && (
        <div className="dash-empty">
          <Icons.Layout size={28} />
          <h3>Empty dashboard</h3>
          <p>Add a widget to begin monitoring this device.</p>
          <button className="dash-empty-btn" onClick={onRequestAdd}>
            <Icons.Plus size={13} /> Add widget
          </button>
        </div>
      )}
    </div>
  );
}
