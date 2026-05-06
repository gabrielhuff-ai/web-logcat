// Widget palette modal — pick a widget kind to add to the dashboard.
// Ports `design/v2/source/dashboard.jsx → WidgetPalette`. Renders all 5
// cards but greys-out + tooltips any kind whose registry entry has
// `enabled: false`. Mirror's card additionally greys-out with
// "Only one mirror at a time" if a Mirror tile already exists (its
// `maxInstances` is 1).

import { useEffect } from 'react';
import * as Icons from './Icons';
import { WIDGETS, WIDGET_KINDS } from '../lib/widgets';
import type { LayoutState, WidgetKind } from '../types';

export interface WidgetPaletteProps {
  layout: LayoutState;
  onClose: () => void;
  onPick: (kind: WidgetKind) => void;
}

export function WidgetPalette({ layout, onClose, onPick }: WidgetPaletteProps) {
  // Esc dismisses the modal. The scrim already handles outside-click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="palette-back" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Add widget">
        <div className="palette-head">
          <h3>Add widget</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icons.Close size={12} />
          </button>
        </div>
        <div className="palette-grid">
          {WIDGET_KINDS.map((kind) => {
            const def = WIDGETS[kind];
            const Icon = def.icon;
            const blocked = blockingReason(kind, layout);
            const disabled = !def.enabled || blocked != null;
            const tooltip = !def.enabled ? 'Coming soon' : blocked ?? '';
            return (
              <button
                key={kind}
                className={`palette-card ${disabled ? 'disabled' : ''}`}
                onClick={() => {
                  if (disabled) return;
                  onPick(kind);
                }}
                disabled={disabled}
                title={tooltip || undefined}
                aria-disabled={disabled}
              >
                <div className="palette-card-icon">
                  <Icon size={20} />
                </div>
                <div className="palette-card-title">{def.name}</div>
                <div className="palette-card-desc">
                  {disabled ? tooltip || def.desc : def.desc}
                </div>
              </button>
            );
          })}
        </div>
        <div className="palette-foot">
          Drag widget headers to swap · Drag the seam between widgets to resize
        </div>
      </div>
    </>
  );
}

/**
 * If this kind cannot be added right now, return a short human reason;
 * otherwise null. Currently only Mirror's `maxInstances: 1` triggers
 * here — everything else gates on `enabled`.
 */
function blockingReason(kind: WidgetKind, layout: LayoutState): string | null {
  const def = WIDGETS[kind];
  if (def.maxInstances != null) {
    let count = 0;
    for (const t of Object.values(layout.tiles)) {
      if (t.kind === kind) count += 1;
    }
    if (count >= def.maxInstances) {
      return def.maxInstances === 1
        ? 'Only one mirror at a time'
        : `Limit ${def.maxInstances} reached`;
    }
  }
  return null;
}
