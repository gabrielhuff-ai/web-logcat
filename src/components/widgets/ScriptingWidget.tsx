// Scripting widget — a user-built control panel over one shell script.
//
// Renders the authored controls as a responsive panel; shows the empty state
// until controls exist. Pressing an action button runs its function one-shot
// (env/argv, injection-safe) and routes stdout/stderr/exit to the bound
// console. Inputs hold values that are exported on every run. Displays +
// polling arrive in the next milestone.
//
// The builder is a standalone modal owned here, opened from the empty-state
// CTA and the tile-header cog (via builderBus).

import '../../styles/widgets/scripting.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Icons from '../Icons';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import { fnFromLabel } from '../../lib/scripting/derive';
import { runFunction, ShellUnsupportedError, type RunResult } from '../../lib/scripting/runner';
import { runFunctionSim } from '../../lib/scripting/sim';
import {
  SCRIPTING_DEFAULTS,
  type ControlConfig,
  type ControlValue,
  type ScriptingSettings,
} from './scripting/scriptingSettings';
import { ScriptingBuilderModal } from './scripting/ScriptingBuilderModal';
import { ScriptingPanel } from './scripting/ScriptingPanel';
import { EMPTY_CONSOLE, type ConsoleView, type DisplayValue } from './scripting/panelTypes';
import { envFromControls } from './scripting/env';
import { onOpenBuilder } from './scripting/builderBus';
import type { ConsoleLine, CtrlState } from './scripting/controls';

const INPUT_KINDS = new Set(['text', 'slider', 'toggle', 'select', 'stepper', 'knob']);
const isInput = (c: ControlConfig): boolean => INPUT_KINDS.has(c.kind);

function seedValues(controls: ControlConfig[]): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (const c of controls) {
    if (isInput(c) && 'defaultValue' in c) out[c.id] = c.defaultValue;
  }
  return out;
}

/** Split a run's stdout/stderr into typed console lines, led by the command. */
function toConsoleLines(fn: string, r: RunResult): ConsoleLine[] {
  const lines: ConsoleLine[] = [{ kind: 'cmd', text: `$ ${fn}` }];
  const push = (text: string, kind: 'out' | 'err') => {
    for (const l of text.replace(/\n$/, '').split('\n')) {
      if (l !== '' || text !== '') lines.push({ kind, text: l });
    }
  };
  if (r.stdout) push(r.stdout, 'out');
  if (r.stderr) push(r.stderr, 'err');
  return lines;
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

  // Runtime state — not persisted.
  const [values, setValues] = useState<Record<string, ControlValue>>(() => seedValues(controls));
  const [buttonState, setButtonState] = useState<Record<string, CtrlState>>({});
  const [displayValues] = useState<Record<string, DisplayValue>>({});
  const [consoleViews, setConsoleViews] = useState<Record<string, ConsoleView>>({});

  // Keep a ref to the latest values so run handlers read fresh state without
  // re-creating the callbacks on every keystroke.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const copyTimers = useRef<Record<string, number>>({});

  // Reconcile values when the controls config changes (builder save).
  useEffect(() => {
    setValues((prev) => {
      const seeded = seedValues(controls);
      const next: Record<string, ControlValue> = {};
      for (const id of Object.keys(seeded)) next[id] = id in prev ? prev[id] : seeded[id];
      return next;
    });
  }, [controls]);

  useEffect(() => onOpenBuilder(tileId, () => setBuilderOpen(true)), [tileId]);

  useEffect(() => {
    const timers = copyTimers.current;
    return () => {
      for (const t of Object.values(timers)) window.clearTimeout(t);
    };
  }, []);

  // The console a button's output lands in: an explicit console id, or the
  // first console control for the default 'console' target.
  const resolveConsoleId = useCallback(
    (bindOutputTo: string): string | null => {
      if (bindOutputTo && bindOutputTo !== 'console') {
        return controls.some((c) => c.id === bindOutputTo && c.kind === 'console')
          ? bindOutputTo
          : null;
      }
      return controls.find((c) => c.kind === 'console')?.id ?? null;
    },
    [controls],
  );

  const setConsole = useCallback((id: string | null, view: ConsoleView) => {
    if (!id) return;
    setConsoleViews((prev) => ({ ...prev, [id]: view }));
  }, []);

  const onRun = useCallback(
    (buttonId: string) => {
      const ctl = controls.find((c) => c.id === buttonId);
      if (!ctl || ctl.kind !== 'button') return;
      if (buttonState[buttonId] === 'busy') return;
      const fn = fnFromLabel(ctl.label);
      const consoleId = resolveConsoleId(ctl.bindOutputTo);

      setButtonState((s) => ({ ...s, [buttonId]: 'busy' }));
      setConsole(consoleId, { ...EMPTY_CONSOLE, empty: false, state: 'busy' });

      const env = envFromControls(controls, valuesRef.current);
      const finish = (r: RunResult) => {
        const ok = r.exitCode === 0;
        setButtonState((s) => ({ ...s, [buttonId]: ok ? 'idle' : 'error' }));
        setConsole(consoleId, {
          lines: toConsoleLines(fn, r),
          state: ok ? 'idle' : 'error',
          exit: r.exitCode,
          empty: false,
          copied: false,
        });
      };

      if (usingFake || !adb) {
        finish(runFunctionSim(settings.script, fn, env));
        return;
      }
      runFunction(adb, { script: settings.script, fn, env, runAsRoot: settings.runAsRoot })
        .then(finish)
        .catch((err: unknown) => {
          const msg =
            err instanceof ShellUnsupportedError
              ? 'This device does not support shell-protocol v2.'
              : err instanceof Error
                ? err.message
                : String(err);
          setButtonState((s) => ({ ...s, [buttonId]: 'error' }));
          setConsole(consoleId, {
            lines: [
              { kind: 'cmd', text: `$ ${fn}` },
              { kind: 'err', text: msg },
            ],
            state: 'error',
            exit: 1,
            empty: false,
            copied: false,
          });
          showToast(`scripting: ${msg}`);
        });
    },
    [adb, usingFake, controls, buttonState, resolveConsoleId, setConsole, settings.script, settings.runAsRoot, showToast],
  );

  const onCopyConsole = useCallback(
    (id: string) => {
      const view = consoleViews[id];
      if (!view) return;
      const text = view.lines.map((l) => l.text).join('\n');
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          setConsoleViews((prev) => ({ ...prev, [id]: { ...prev[id], copied: true } }));
          window.clearTimeout(copyTimers.current[id]);
          copyTimers.current[id] = window.setTimeout(() => {
            setConsoleViews((prev) => ({ ...prev, [id]: { ...prev[id], copied: false } }));
          }, 1200);
        })
        .catch(() => showToast('Copy failed'));
    },
    [consoleViews, showToast],
  );

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
          buttonState={buttonState}
          onRun={onRun}
          displayValues={displayValues}
          consoleViews={consoleViews}
          onCopyConsole={onCopyConsole}
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
