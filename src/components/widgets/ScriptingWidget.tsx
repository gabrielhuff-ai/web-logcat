// Scripting widget — a user-built control panel over one shell script.
//
// Renders the authored controls as a responsive panel; shows the empty state
// until controls exist. Holds runtime state: current input values (seeded
// from each control's default), per-button run lifecycle, per-display values,
// and the console view. Execution is wired in a later milestone — for now
// inputs are live and actions/displays are inert.
//
// The builder is a large standalone modal owned here, opened from this body's
// empty-state CTA and from the tile-header cog (which signals us via
// builderBus, since the cog lives in the generic Tile chrome).

import '../../styles/widgets/scripting.css';
import { useEffect, useMemo, useState } from 'react';
import * as Icons from '../Icons';
import { useTileSettings } from '../../lib/tileSettings';
import {
  SCRIPTING_DEFAULTS,
  type ControlConfig,
  type ControlValue,
  type ScriptingSettings,
} from './scripting/scriptingSettings';
import { ScriptingBuilderModal } from './scripting/ScriptingBuilderModal';
import { ScriptingPanel, type ConsoleView, type DisplayValue } from './scripting/ScriptingPanel';
import { onOpenBuilder } from './scripting/builderBus';
import type { CtrlState } from './scripting/controls';

const INPUT_KINDS = new Set(['text', 'slider', 'toggle', 'select', 'stepper', 'knob']);
const isInput = (c: ControlConfig): boolean => INPUT_KINDS.has(c.kind);

const EMPTY_CONSOLE: ConsoleView = {
  lines: [],
  state: 'idle',
  exit: 0,
  empty: true,
  copied: false,
};

/** Build the initial value map from input controls' defaults. */
function seedValues(controls: ControlConfig[]): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (const c of controls) {
    if (isInput(c) && 'defaultValue' in c) out[c.id] = c.defaultValue;
  }
  return out;
}

export interface ScriptingWidgetProps {
  /** Stable id of the host tile — namespaces per-instance state. */
  tileId: string;
}

export function ScriptingWidget({ tileId }: ScriptingWidgetProps) {
  const [settings] = useTileSettings<ScriptingSettings>(tileId, 'scripting', SCRIPTING_DEFAULTS);
  const [builderOpen, setBuilderOpen] = useState(false);

  const controls = settings.controls;

  // Runtime state — not persisted.
  const [values, setValues] = useState<Record<string, ControlValue>>(() => seedValues(controls));
  const [buttonState] = useState<Record<string, CtrlState>>({});
  const [displayValues] = useState<Record<string, DisplayValue>>({});
  const consoleView = EMPTY_CONSOLE;

  // Reconcile the value map when the controls config changes (builder save):
  // keep current values for surviving inputs, seed new ones from defaults,
  // drop removed ones.
  useEffect(() => {
    setValues((prev) => {
      const seeded = seedValues(controls);
      const next: Record<string, ControlValue> = {};
      for (const id of Object.keys(seeded)) {
        next[id] = id in prev ? prev[id] : seeded[id];
      }
      return next;
    });
  }, [controls]);

  // The tile-header cog opens us through the bus.
  useEffect(() => onOpenBuilder(tileId, () => setBuilderOpen(true)), [tileId]);

  const fontStyle = useMemo(
    () => ({ ['--widget-font-size' as string]: `${settings.fontSize}px` }) as const,
    [settings.fontSize],
  );
  const hasControls = controls.length > 0;

  return (
    <div className="sw-body" style={fontStyle}>
      {hasControls ? (
        <ScriptingPanel
          controls={controls}
          values={values}
          onInputChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
          buttonState={buttonState}
          onRun={() => {
            /* execution wired in a later milestone */
          }}
          displayValues={displayValues}
          console={consoleView}
          onCopyConsole={() => {
            /* wired with execution */
          }}
        />
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
