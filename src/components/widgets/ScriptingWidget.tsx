// Scripting widget — a user-built control panel over one shell script.
//
// The runtime body renders the authored controls (built out across later
// milestones); for now it shows the empty state until controls exist. The
// builder is a large standalone modal owned here and opened from two places:
// this body's empty-state CTA and the tile-header cog (which signals us via
// builderBus, since the cog lives in the generic Tile chrome).

import '../../styles/widgets/scripting.css';
import { useEffect, useState } from 'react';
import * as Icons from '../Icons';
import { useTileSettings } from '../../lib/tileSettings';
import { SCRIPTING_DEFAULTS, type ScriptingSettings } from './scripting/scriptingSettings';
import { ScriptingBuilderModal } from './scripting/ScriptingBuilderModal';
import { onOpenBuilder } from './scripting/builderBus';

export interface ScriptingWidgetProps {
  /** Stable id of the host tile — namespaces per-instance state. */
  tileId: string;
}

export function ScriptingWidget({ tileId }: ScriptingWidgetProps) {
  const [settings] = useTileSettings<ScriptingSettings>(
    tileId,
    'scripting',
    SCRIPTING_DEFAULTS,
  );
  const [builderOpen, setBuilderOpen] = useState(false);

  // The tile-header cog opens us through the bus (it can't reach our state
  // directly — it lives in the generic Tile chrome).
  useEffect(() => onOpenBuilder(tileId, () => setBuilderOpen(true)), [tileId]);

  const fontStyle = { ['--widget-font-size' as string]: `${settings.fontSize}px` } as const;
  const hasControls = settings.controls.length > 0;

  return (
    <div className="sw-body" style={fontStyle}>
      {hasControls ? (
        // Real control rendering lands in the next milestone.
        <div className="bdr-config-empty">
          {settings.controls.length} control(s) configured. Panel rendering arrives next.
        </div>
      ) : (
        <EmptyState onBuild={() => setBuilderOpen(true)} />
      )}

      {builderOpen && (
        <ScriptingBuilderModal tileId={tileId} onClose={() => setBuilderOpen(false)} />
      )}
    </div>
  );
}

function EmptyState({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="empty-script">
      <div className="empty-script-art">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <defs>
            <pattern id="sc-empty-grid" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            </pattern>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="8" fill="url(#sc-empty-grid)" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          <rect x="12" y="14" width="22" height="6" rx="3" fill="currentColor" opacity="0.7" />
          <rect x="38" y="14" width="14" height="6" rx="3" fill="currentColor" opacity="0.4" />
          <rect x="12" y="26" width="40" height="4" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="12" y="34" width="40" height="14" rx="3" fill="currentColor" opacity="0.25" />
          <path d="M 32 38 l 0 6 M 29 41 l 3 -3 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
        </svg>
      </div>
      <h3>Build your control panel</h3>
      <p>
        Write shell functions, then add inputs and displays that call them. Everything lives in one
        shared environment.
      </p>
      <button type="button" className="empty-script-cta" onClick={onBuild}>
        <Icons.Settings size={12} /> Open settings to build
      </button>
      <div className="empty-script-tip">
        <Icons.Settings size={9} /> Same as the <strong>cog</strong> in this tile&apos;s header
      </div>
    </div>
  );
}
