// Scripting widget — a user-built control panel over one shell script.
//
// Renders the authored controls as a responsive panel; shows the empty state
// until controls exist. Holds the current input values (seeded from defaults)
// and delegates running, console output, and display polling to
// useScriptingRuntime. Actions run one-shot (env/argv, injection-safe).
//
// The builder is a standalone modal owned here, opened from the empty-state
// CTA and the tile-header cog (via builderBus).

import '../../styles/widgets/scripting.css';
import { useEffect, useMemo, useState } from 'react';
import * as Icons from '../Icons';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import {
  SCRIPTING_DEFAULTS,
  type ControlConfig,
  type ControlValue,
  type ScriptingSettings,
} from './scripting/scriptingSettings';
import { ScriptingBuilderModal } from './scripting/ScriptingBuilderModal';
import { ScriptingPanel } from './scripting/ScriptingPanel';
import { isInputControl } from './scripting/env';
import { useScriptingRuntime } from './scripting/useScriptingRuntime';
import { onOpenBuilder } from './scripting/builderBus';

function seedValues(controls: ControlConfig[]): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (const c of controls) {
    if (isInputControl(c)) out[c.id] = c.defaultValue;
  }
  return out;
}

export interface ScriptingWidgetProps {
  /** Stable id of the host tile — namespaces per-instance state. */
  tileId: string;
}

export function ScriptingWidget({ tileId }: ScriptingWidgetProps) {
  const { adb, usingFake } = useAdb();
  const { showToast } = useDashboardChrome();
  const [settings] = useTileSettings<ScriptingSettings>(tileId, 'scripting', SCRIPTING_DEFAULTS);
  const [builderOpen, setBuilderOpen] = useState(false);

  const controls = settings.controls;
  const [values, setValues] = useState<Record<string, ControlValue>>(() => seedValues(controls));

  // Reconcile values when the controls config changes (builder save): keep
  // surviving inputs, seed new ones, drop removed ones.
  useEffect(() => {
    setValues((prev) => {
      const seeded = seedValues(controls);
      const next: Record<string, ControlValue> = {};
      for (const id of Object.keys(seeded)) next[id] = id in prev ? prev[id] : seeded[id];
      return next;
    });
  }, [controls]);

  useEffect(() => onOpenBuilder(tileId, () => setBuilderOpen(true)), [tileId]);

  const runtime = useScriptingRuntime({
    controls,
    script: settings.script,
    runAsRoot: settings.runAsRoot,
    adb,
    usingFake,
    values,
    showToast,
  });

  const fontStyle = useMemo(
    () => ({ ['--widget-font-size' as string]: `${settings.fontSize}px` }) as const,
    [settings.fontSize],
  );

  return (
    <div className="sw-body" style={fontStyle}>
      {controls.length > 0 ? (
        <ScriptingPanel
          controls={controls}
          values={values}
          onInputChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))}
          buttonState={runtime.buttonState}
          onRun={runtime.onRun}
          displayValues={runtime.displayValues}
          consoleViews={runtime.consoleViews}
          onCopyConsole={runtime.onCopyConsole}
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
