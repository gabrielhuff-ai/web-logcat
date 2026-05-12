// Quick-add menu for tile creation. Opens on `Cmd/Ctrl+N`; pressing a
// widget's shortcut key inserts it immediately. A "More…" row at the
// bottom hands off to the full `<WidgetPalette/>` for users who want
// the descriptions and capacity hints.
//
// Visual model: a compact floating panel centred near the top of the
// dashboard. Auto-focuses itself on mount so the next keystroke can
// pick a widget without a click first.

import { useEffect, useRef } from 'react';
import { WIDGETS, WIDGET_KINDS } from '../lib/widgets';
import { countByKind } from '../lib/layout';
import type { LayoutState, WidgetKind } from '../types';

export interface QuickAddMenuProps {
  layout: LayoutState;
  onPick: (kind: WidgetKind) => void;
  onMore: () => void;
  onClose: () => void;
}

export function QuickAddMenu({ layout, onPick, onMore, onClose }: QuickAddMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount so the next keypress lands on the menu.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // Global key listener — `keydown` rather than the local `onKeyDown`
  // so single-letter shortcuts work even if the focus slips away
  // during a re-render (e.g. when the layout snapshot updates).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
      // Single-letter shortcut → add the matching widget.
      for (const kind of WIDGET_KINDS) {
        const def = WIDGETS[kind];
        if (!def.enabled) continue;
        if (def.shortcutKey === key && !atCapacity(layout, kind)) {
          e.preventDefault();
          onPick(kind);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, onPick, onClose]);

  // Outside click dismisses the menu.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // `mousedown` rather than `click` so we close before any button
    // inside `<DashTopbar/>` fires its onClick — otherwise the
    // "Add widget" button would reopen the full palette.
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
      >
        <div className="qa-head">New widget</div>
        {WIDGET_KINDS.filter((k) => WIDGETS[k].enabled).map((kind) => {
          const def = WIDGETS[kind];
          const Icon = def.icon;
          const capped = atCapacity(layout, kind);
          return (
            <button
              key={kind}
              type="button"
              className={`qa-row ${capped ? 'qa-row-disabled' : ''}`}
              role="menuitem"
              disabled={capped}
              onClick={() => onPick(kind)}
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
        <div className="qa-sep" role="separator" />
        <button
          type="button"
          className="qa-row qa-row-more"
          role="menuitem"
          onClick={onMore}
        >
          <span className="qa-row-name">More…</span>
        </button>
      </div>
    </div>
  );
}

function atCapacity(layout: LayoutState, kind: WidgetKind): boolean {
  const cap = WIDGETS[kind].maxInstances;
  if (cap == null) return false;
  return countByKind(layout, kind) >= cap;
}
