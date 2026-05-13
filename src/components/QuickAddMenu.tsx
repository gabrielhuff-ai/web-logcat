// Quick-add menu for tile creation. Opens on `Cmd/Ctrl+E`; pressing a
// widget's shortcut key inserts it immediately. A "More…" row at the
// bottom hands off to the full `<WidgetPalette/>` for users who want
// the descriptions and capacity hints.
//
// Keyboard:
//   - `Esc`             → dismiss.
//   - `↑` / `↓`         → cycle the highlighted row (wraps; skips
//                         capacity-capped widgets).
//   - `Enter`           → pick the highlighted row (or open the full
//                         palette if "More…" is highlighted).
//   - single letter     → jump-pick the matching widget (`L`, `S`, …).
//
// The arrow / Enter handlers are registered with `capture: true` and
// `stopImmediatePropagation` so the Dashboard's tile-focus arrow
// shortcuts and the tile-delete shortcut don't fire while the menu
// is open.
//
// Visual model: a compact floating panel anchored to the focused
// tile (clamped to the viewport so the menu never spills off-screen).
// Falls back to a top-centred position when no tile is focused (the
// empty-state CTA case). Auto-focuses itself on mount.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WIDGETS, WIDGET_KINDS } from '../lib/widgets';
import { countByKind } from '../lib/layout';
import type { LayoutState, WidgetKind } from '../types';

export interface QuickAddMenuProps {
  layout: LayoutState;
  onPick: (kind: WidgetKind) => void;
  onMore: () => void;
  onClose: () => void;
}

/**
 * Row in the menu, in render order. The trailing `null` represents
 * the "More…" row; using `null` for that kind keeps the rest of the
 * logic dealing in `WidgetKind`s without a sentinel string.
 */
type Row = { kind: WidgetKind; capped: boolean } | { kind: null; capped: false };

export function QuickAddMenu({ layout, onPick, onMore, onClose }: QuickAddMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const kind of WIDGET_KINDS) {
      if (!WIDGETS[kind].enabled) continue;
      out.push({ kind, capped: atCapacity(layout, kind) });
    }
    out.push({ kind: null, capped: false });
    return out;
  }, [layout]);

  // Index of the currently-highlighted row. Defaults to the first
  // selectable row (first non-capped widget, falling back to "More…"
  // if all widgets are capped — unlikely but defensive).
  const initialIdx = useMemo(() => {
    const i = rows.findIndex((r) => !r.capped);
    return i >= 0 ? i : 0;
  }, [rows]);
  const [highlight, setHighlight] = useState(initialIdx);
  // Keep `highlight` valid when `rows` changes (e.g. the layout
  // mutates while the menu is open).
  useEffect(() => {
    if (highlight >= rows.length) setHighlight(rows.length - 1);
  }, [rows.length, highlight]);

  // Auto-focus on mount so the next keypress lands on the menu.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // Anchor the menu at the focused tile's top-left, clamped so it
  // never spills past the viewport. Measured in a layout effect so
  // the menu is positioned before the first paint — the initial
  // render uses `visibility: hidden` to hide the unpositioned frame.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const menu = rootRef.current;
    if (!menu) return;
    const m = menu.getBoundingClientRect();
    const margin = 8;
    const focusEl = layout.focusId
      ? document.querySelector<HTMLElement>(
          `[data-tile-id="${CSS.escape(layout.focusId)}"]`,
        )
      : null;
    let left: number;
    let top: number;
    if (focusEl) {
      const wr = focusEl.getBoundingClientRect();
      // Inset a touch from the corner so the menu visibly sits "in"
      // the widget instead of perfectly hugging its edge.
      left = wr.left + 12;
      top = wr.top + 12;
    } else {
      // No focused widget (empty-state CTA): centre near the top.
      left = (window.innerWidth - m.width) / 2;
      top = 70;
    }
    const maxLeft = window.innerWidth - m.width - margin;
    const maxTop = window.innerHeight - m.height - margin;
    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));
    setPos({ left, top });
  }, [layout.focusId]);

  // Global capture-phase key listener. Capture-phase + a
  // stopImmediatePropagation on every key we consume keeps the
  // Dashboard's arrow-key tile-focus + tile-delete shortcuts from
  // firing while the menu is up.
  useEffect(() => {
    const isSelectable = (i: number): boolean => {
      const r = rows[i];
      return !!r && !r.capped;
    };
    const step = (delta: 1 | -1) => {
      if (rows.length === 0) return;
      let i = highlight;
      for (let n = 0; n < rows.length; n += 1) {
        i = (i + delta + rows.length) % rows.length;
        if (isSelectable(i)) {
          setHighlight(i);
          return;
        }
      }
    };
    const commit = () => {
      const r = rows[highlight];
      if (!r) return;
      if (r.kind === null) onMore();
      else if (!r.capped) onPick(r.kind);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        step(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        step(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        commit();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // Don't hijack typing inside a sibling input — but the only
      // input we expect to be visible while the menu is up is the
      // menu's own host div (tabIndex=-1), so this is a soft guard.
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t?.isContentEditable
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      for (const kind of WIDGET_KINDS) {
        const def = WIDGETS[kind];
        if (!def.enabled) continue;
        if (def.shortcutKey === key && !atCapacity(layout, kind)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          onPick(kind);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [highlight, layout, onPick, onMore, onClose, rows]);

  // Outside click dismisses the menu.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div className="qa-scrim" onMouseDown={onClose}>
      <div
        ref={rootRef}
        className="qa-menu"
        role="menu"
        aria-label="Quick add widget"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        style={
          pos
            ? { left: pos.left, top: pos.top }
            : { visibility: 'hidden' }
        }
      >
        <div className="qa-head">New widget</div>
        {rows.map((r, i) => {
          const active = i === highlight;
          if (r.kind === null) {
            return (
              <div key="__divider" style={{ display: 'contents' }}>
                <div className="qa-sep" role="separator" />
                <button
                  type="button"
                  className={`qa-row qa-row-more ${active ? 'qa-row-active' : ''}`}
                  role="menuitem"
                  onClick={onMore}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="qa-row-name">More…</span>
                </button>
              </div>
            );
          }
          const def = WIDGETS[r.kind];
          const Icon = def.icon;
          return (
            <button
              key={r.kind}
              type="button"
              className={`qa-row ${r.capped ? 'qa-row-disabled' : ''} ${
                active ? 'qa-row-active' : ''
              }`}
              role="menuitem"
              disabled={r.capped}
              onClick={() => onPick(r.kind as WidgetKind)}
              onMouseEnter={() => {
                if (!r.capped) setHighlight(i);
              }}
            >
              <span className="qa-row-icon">
                <Icon size={14} />
              </span>
              <span className="qa-row-name">{def.name}</span>
              <span className="qa-row-key" aria-hidden>
                {def.shortcutKey.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function atCapacity(layout: LayoutState, kind: WidgetKind): boolean {
  const cap = WIDGETS[kind].maxInstances;
  if (cap == null) return false;
  return countByKind(layout, kind) >= cap;
}
