// Scripting widget — runtime engine.
//
// Owns the non-persisted run state: per-button lifecycle, per-console output,
// per-display values. Actions run one-shot and route output to a console;
// bound displays fetch on mount/config-change, on their poll interval, and
// (when enabled) when an input they read changes. Stale async results are
// dropped via a per-target run-id guard.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Adb } from '@yume-chan/adb';
import { fnFromLabel, varNameFromLabel } from '../../../lib/scripting/derive';
import { extractFunctionBody } from '../../../lib/scripting/parseScript';
import {
  checkScript,
  runFunction,
  ShellUnsupportedError,
  type RunResult,
} from '../../../lib/scripting/runner';
import { runFunctionSim } from '../../../lib/scripting/sim';
import { envFromControls, isInputControl } from './env';
import { isBoundDisplay, parseDisplayValue } from './displayParse';
import { EMPTY_CONSOLE, type ConsoleView, type DisplayValue } from './panelTypes';
import type { ConsoleLine, CtrlState } from './controls';
import type { BoundDisplayControl, ControlConfig, ControlValue } from './scriptingSettings';

const BLANK_DISPLAY: DisplayValue = {
  text: '—',
  number: 0,
  state: 'ok',
  ledColor: 'off',
  ledState: 'off',
  stale: false,
};

function toConsoleLines(fn: string, r: RunResult): ConsoleLine[] {
  const lines: ConsoleLine[] = [{ kind: 'cmd', text: `$ ${fn}` }];
  const push = (text: string, kind: 'out' | 'err') => {
    for (const l of text.replace(/\n$/, '').split('\n')) lines.push({ kind, text: l });
  };
  if (r.stdout) push(r.stdout, 'out');
  if (r.stderr) push(r.stderr, 'err');
  return lines;
}

export interface ScriptingRuntimeParams {
  controls: ControlConfig[];
  script: string;
  runAsRoot: boolean;
  adb: Adb | null;
  usingFake: boolean;
  values: Record<string, ControlValue>;
  showToast: (msg: string) => void;
}

export interface ScriptingRuntime {
  buttonState: Record<string, CtrlState>;
  consoleViews: Record<string, ConsoleView>;
  displayValues: Record<string, DisplayValue>;
  /** Non-null when `sh -n` rejected the script (real devices only). */
  scriptError: string | null;
  onRun: (buttonId: string) => void;
  onCopyConsole: (consoleId: string) => void;
}

export function useScriptingRuntime(params: ScriptingRuntimeParams): ScriptingRuntime {
  const { controls, script, runAsRoot, adb, usingFake, values, showToast } = params;

  const [buttonState, setButtonState] = useState<Record<string, CtrlState>>({});
  const [consoleViews, setConsoleViews] = useState<Record<string, ConsoleView>>({});
  const [displayValues, setDisplayValues] = useState<Record<string, DisplayValue>>({});
  const [scriptError, setScriptError] = useState<string | null>(null);

  // Latest values for run handlers without re-creating callbacks per keystroke.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const runIdRef = useRef<Record<string, number>>({});
  const copyTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = copyTimers.current;
    return () => {
      for (const t of Object.values(timers)) window.clearTimeout(t);
    };
  }, []);

  const exec = useCallback(
    (fn: string): Promise<RunResult> => {
      const env = envFromControls(controls, valuesRef.current);
      if (usingFake || !adb) return Promise.resolve(runFunctionSim(script, fn, env));
      return runFunction(adb, { script, fn, env, runAsRoot });
    },
    [controls, script, runAsRoot, adb, usingFake],
  );

  // ── Actions ────────────────────────────────────────────────────────────
  const resolveConsoleId = useCallback(
    (bindOutputTo: string): string | null => {
      if (bindOutputTo && bindOutputTo !== 'console') {
        return controls.some((c) => c.id === bindOutputTo && c.kind === 'console') ? bindOutputTo : null;
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
      setButtonState((s) => {
        if (s[buttonId] === 'busy') return s;
        return { ...s, [buttonId]: 'busy' };
      });
      const fn = fnFromLabel(ctl.label);
      const consoleId = resolveConsoleId(ctl.bindOutputTo);
      setConsole(consoleId, { ...EMPTY_CONSOLE, empty: false, state: 'busy' });

      exec(fn)
        .then((r) => {
          const ok = r.exitCode === 0;
          setButtonState((s) => ({ ...s, [buttonId]: ok ? 'idle' : 'error' }));
          setConsole(consoleId, {
            lines: toConsoleLines(fn, r),
            state: ok ? 'idle' : 'error',
            exit: r.exitCode,
            empty: false,
            copied: false,
          });
        })
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
    [controls, exec, resolveConsoleId, setConsole, showToast],
  );

  const onCopyConsole = useCallback(
    (id: string) => {
      const text = (consoleViews[id]?.lines ?? []).map((l) => l.text).join('\n');
      if (!navigator.clipboard) {
        showToast('Copy unavailable');
        return;
      }
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setConsoleViews((prev) => ({ ...prev, [id]: { ...prev[id], copied: true } }));
          window.clearTimeout(copyTimers.current[id]);
          copyTimers.current[id] = window.setTimeout(() => {
            setConsoleViews((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], copied: false } } : prev));
          }, 1200);
        })
        .catch(() => showToast('Copy failed'));
    },
    [consoleViews, showToast],
  );

  // ── Displays ───────────────────────────────────────────────────────────
  const runDisplay = useCallback(
    (c: BoundDisplayControl) => {
      if (!c.boundTo) return;
      const myId = (runIdRef.current[c.id] = (runIdRef.current[c.id] ?? 0) + 1);
      setDisplayValues((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] ?? BLANK_DISPLAY), stale: true } }));
      exec(c.boundTo)
        .then((r) => {
          if (runIdRef.current[c.id] !== myId) return;
          setDisplayValues((prev) => ({ ...prev, [c.id]: parseDisplayValue(c.kind, r) }));
        })
        .catch(() => {
          if (runIdRef.current[c.id] !== myId) return;
          setDisplayValues((prev) => ({
            ...prev,
            [c.id]: { ...BLANK_DISPLAY, text: 'error', state: 'err', ledColor: 'red', ledState: 'error' },
          }));
        });
    },
    [exec],
  );

  // Fetch auto-poll displays once on mount and whenever the config/script
  // changes (values are read via ref, so input edits don't trigger this).
  // Non-polling displays are NOT auto-run — this also means an imported panel
  // (auto-poll disarmed on import) never executes shell on load.
  useEffect(() => {
    for (const c of controls) {
      if (isBoundDisplay(c) && c.boundTo && c.autoPoll.enabled) runDisplay(c);
    }
  }, [controls, script, runDisplay]);

  // Auto-poll intervals.
  useEffect(() => {
    const timers: number[] = [];
    for (const c of controls) {
      if (isBoundDisplay(c) && c.boundTo && c.autoPoll.enabled && c.autoPoll.intervalSec > 0) {
        timers.push(window.setInterval(() => runDisplay(c), c.autoPoll.intervalSec * 1000));
      }
    }
    return () => timers.forEach((t) => window.clearInterval(t));
  }, [controls, runDisplay]);

  // Refresh-on-change: when an input flagged onChange:'refresh' changes, re-run
  // any refresh-on-change display whose bound function reads that variable.
  const prevValuesRef = useRef(values);
  useEffect(() => {
    const prev = prevValuesRef.current;
    prevValuesRef.current = values;
    const changedVars = new Set<string>();
    for (const c of controls) {
      if (isInputControl(c) && c.onChange === 'refresh' && prev[c.id] !== values[c.id]) {
        changedVars.add(varNameFromLabel(c.label));
      }
    }
    if (changedVars.size === 0) return;
    for (const c of controls) {
      if (!isBoundDisplay(c) || !c.refreshOnChange || !c.boundTo) continue;
      const body = extractFunctionBody(script, c.boundTo) ?? '';
      const reads = [...changedVars].some((v) => body.includes('$' + v) || body.includes('${' + v));
      if (reads) runDisplay(c);
    }
  }, [values, controls, script, runDisplay]);

  // Authoritative syntax check via `sh -n` on a real device. The script only
  // changes on builder Save, so no debounce is needed. Skipped on the
  // simulator (no shell to validate against).
  useEffect(() => {
    if (usingFake || !adb) {
      setScriptError(null);
      return;
    }
    let cancelled = false;
    checkScript(adb, script)
      .then((err) => {
        if (!cancelled) setScriptError(err);
      })
      .catch(() => {
        if (!cancelled) setScriptError(null);
      });
    return () => {
      cancelled = true;
    };
  }, [script, adb, usingFake]);

  return { buttonState, consoleViews, displayValues, scriptError, onRun, onCopyConsole };
}
