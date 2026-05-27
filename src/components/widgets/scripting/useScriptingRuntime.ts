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
  streamFunction,
  ShellUnsupportedError,
  type RunResult,
  type StreamLineKind,
} from '../../../lib/scripting/runner';
import { runFunctionSim, streamFunctionSim } from '../../../lib/scripting/sim';
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

/** Cap a streaming console's scrollback so a fast feed can't grow unbounded. */
const MAX_STREAM_LINES = 1000;

/** A running stream — `stop()` kills the underlying process / timer. */
interface ActiveStream {
  stop: () => void | Promise<void>;
}

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
  // Live streams keyed by button id, and the set of auto-start buttons we've
  // already kicked off (so a re-render doesn't relaunch one the user stopped).
  const streamsRef = useRef<Record<string, ActiveStream>>({});
  const autoStartedRef = useRef<Set<string>>(new Set());

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

  // Run a function and stream its result into a console. Returns the run so
  // callers can react to the exit code (e.g. a button's lifecycle).
  const execToConsole = useCallback(
    (fn: string, consoleId: string | null): Promise<RunResult> => {
      setConsole(consoleId, { ...EMPTY_CONSOLE, empty: false, state: 'busy' });
      const p = exec(fn);
      p.then((r) => {
        setConsole(consoleId, {
          lines: toConsoleLines(fn, r),
          state: r.exitCode === 0 ? 'idle' : 'error',
          exit: r.exitCode,
          empty: false,
          copied: false,
          streaming: false,
          stopped: false,
        });
      }).catch((err: unknown) => {
        const msg =
          err instanceof ShellUnsupportedError
            ? 'This device does not support shell-protocol v2.'
            : err instanceof Error
              ? err.message
              : String(err);
        setConsole(consoleId, {
          lines: [
            { kind: 'cmd', text: `$ ${fn}` },
            { kind: 'err', text: msg },
          ],
          state: 'error',
          exit: 1,
          empty: false,
          copied: false,
          streaming: false,
          stopped: false,
        });
        showToast(`scripting: ${msg}`);
      });
      return p;
    },
    [exec, setConsole, showToast],
  );

  // ── Streaming actions ────────────────────────────────────────────────────
  // Append one streamed line to a console, capping scrollback (a leading
  // `$ command` line is always kept so the header survives the cap).
  const appendConsole = useCallback((consoleId: string | null, text: string, kind: StreamLineKind) => {
    if (!consoleId) return;
    setConsoleViews((prev) => {
      const v = prev[consoleId] ?? EMPTY_CONSOLE;
      const lines = v.lines.concat({ kind, text });
      let capped = lines;
      if (lines.length > MAX_STREAM_LINES) {
        const head = lines[0]?.kind === 'cmd' ? [lines[0]] : [];
        capped = head.concat(lines.slice(lines.length - (MAX_STREAM_LINES - head.length)));
      }
      return { ...prev, [consoleId]: { ...v, lines: capped, empty: false } };
    });
  }, []);

  // The process ended on its own — show its exit code and clear the button.
  const finishStream = useCallback((buttonId: string, consoleId: string | null, code: number) => {
    delete streamsRef.current[buttonId];
    setButtonState((s) => ({ ...s, [buttonId]: code === 0 ? 'idle' : 'error' }));
    if (!consoleId) return;
    setConsoleViews((prev) => {
      const v = prev[consoleId];
      if (!v) return prev;
      return { ...prev, [consoleId]: { ...v, streaming: false, stopped: false, state: code === 0 ? 'idle' : 'error', exit: code } };
    });
  }, []);

  const startStream = useCallback(
    (buttonId: string) => {
      const ctl = controls.find((c) => c.id === buttonId);
      if (!ctl || ctl.kind !== 'button' || streamsRef.current[buttonId]) return;
      const consoleId = resolveConsoleId(ctl.bindOutputTo);
      const fn = fnFromLabel(ctl.label);
      const env = envFromControls(controls, valuesRef.current);
      setButtonState((s) => ({ ...s, [buttonId]: 'active' }));
      setConsole(consoleId, {
        lines: [{ kind: 'cmd', text: `$ ${fn}` }],
        state: 'idle',
        exit: 0,
        empty: false,
        copied: false,
        streaming: true,
        stopped: false,
      });
      const onLine = (text: string, kind: StreamLineKind) => appendConsole(consoleId, text, kind);

      if (usingFake || !adb) {
        streamsRef.current[buttonId] = streamFunctionSim(script, fn, env, {
          onLine,
          onExit: (code) => finishStream(buttonId, consoleId, code),
        });
        return;
      }

      // Real device: the spawn is async, so park a cancel-only handle until it
      // resolves — if the user stops in the gap, kill the process on arrival.
      let cancelled = false;
      streamsRef.current[buttonId] = {
        stop: () => {
          cancelled = true;
        },
      };
      streamFunction(
        adb,
        { script, fn, env, runAsRoot },
        {
          onLine,
          onExit: (code) => finishStream(buttonId, consoleId, code),
          onError: (err) => {
            onLine(err.message, 'err');
            finishStream(buttonId, consoleId, 1);
          },
        },
      )
        .then((handle) => {
          if (cancelled) {
            void handle.stop();
            return;
          }
          streamsRef.current[buttonId] = handle;
        })
        .catch((err: unknown) => {
          delete streamsRef.current[buttonId];
          const msg =
            err instanceof ShellUnsupportedError
              ? 'This device does not support shell-protocol v2.'
              : err instanceof Error
                ? err.message
                : String(err);
          onLine(msg, 'err');
          setButtonState((s) => ({ ...s, [buttonId]: 'error' }));
          if (consoleId)
            setConsoleViews((prev) => {
              const v = prev[consoleId];
              return v ? { ...prev, [consoleId]: { ...v, streaming: false, stopped: true } } : prev;
            });
          showToast(`scripting: ${msg}`);
        });
    },
    [controls, script, runAsRoot, adb, usingFake, resolveConsoleId, setConsole, appendConsole, finishStream, showToast],
  );

  const stopStream = useCallback(
    (buttonId: string) => {
      const h = streamsRef.current[buttonId];
      if (!h) return;
      delete streamsRef.current[buttonId];
      void h.stop();
      const ctl = controls.find((c) => c.id === buttonId);
      const consoleId = ctl && ctl.kind === 'button' ? resolveConsoleId(ctl.bindOutputTo) : null;
      setButtonState((s) => ({ ...s, [buttonId]: 'idle' }));
      if (consoleId)
        setConsoleViews((prev) => {
          const v = prev[consoleId];
          return v ? { ...prev, [consoleId]: { ...v, streaming: false, stopped: true } } : prev;
        });
    },
    [controls, resolveConsoleId],
  );

  const onRun = useCallback(
    (buttonId: string) => {
      const ctl = controls.find((c) => c.id === buttonId);
      if (!ctl || ctl.kind !== 'button') return;
      if (ctl.mode === 'stream') {
        if (streamsRef.current[buttonId]) stopStream(buttonId);
        else startStream(buttonId);
        return;
      }
      setButtonState((s) => (s[buttonId] === 'busy' ? s : { ...s, [buttonId]: 'busy' }));
      execToConsole(fnFromLabel(ctl.label), resolveConsoleId(ctl.bindOutputTo))
        .then((r) => setButtonState((s) => ({ ...s, [buttonId]: r.exitCode === 0 ? 'idle' : 'error' })))
        .catch(() => setButtonState((s) => ({ ...s, [buttonId]: 'error' })));
    },
    [controls, execToConsole, resolveConsoleId, startStream, stopStream],
  );

  const onCopyConsole = useCallback(
    (id: string) => {
      // Copy only the output, not the leading `$ command` line.
      const text = (consoleViews[id]?.lines ?? [])
        .filter((l) => l.kind !== 'cmd')
        .map((l) => l.text)
        .join('\n');
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

  // React to an input's value changing. An input set to onChange:'refresh'
  // re-runs displays that read its var; one set to onChange:'run' runs its own
  // function (derived from its label) and routes output to its bound console.
  // Only fires for inputs that already existed last render (so a builder-save
  // that seeds a new input never auto-fires).
  const prevValuesRef = useRef(values);
  useEffect(() => {
    const prev = prevValuesRef.current;
    prevValuesRef.current = values;
    const changedVars = new Set<string>();
    for (const c of controls) {
      if (!isInputControl(c)) continue;
      if (!(c.id in prev) || prev[c.id] === values[c.id]) continue;
      if (c.onChange === 'refresh') {
        changedVars.add(varNameFromLabel(c.label));
      } else if (c.onChange === 'run') {
        execToConsole(fnFromLabel(c.label), resolveConsoleId(c.bindOutputTo ?? 'console'));
      }
    }
    if (changedVars.size === 0) return;
    for (const c of controls) {
      if (!isBoundDisplay(c) || !c.refreshOnChange || !c.boundTo) continue;
      const body = extractFunctionBody(script, c.boundTo) ?? '';
      const reads = [...changedVars].some((v) => body.includes('$' + v) || body.includes('${' + v));
      if (reads) runDisplay(c);
    }
  }, [values, controls, script, runDisplay, execToConsole, resolveConsoleId]);

  // Authoritative syntax check via `sh -n` on a real device. Debounced —
  // the script is edited live in the builder, so we don't want a device
  // round-trip on every keystroke. Skipped on the simulator (no shell).
  useEffect(() => {
    if (usingFake || !adb) {
      setScriptError(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      checkScript(adb, script)
        .then((err) => {
          if (!cancelled) setScriptError(err);
        })
        .catch(() => {
          if (!cancelled) setScriptError(null);
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [script, adb, usingFake]);

  // Auto-start streaming buttons once after the dashboard loads. Guarded so a
  // re-render (or a stream the user stopped) never relaunches on its own.
  useEffect(() => {
    for (const c of controls) {
      if (
        c.kind === 'button' &&
        c.mode === 'stream' &&
        c.autoStart &&
        !autoStartedRef.current.has(c.id) &&
        !streamsRef.current[c.id]
      ) {
        autoStartedRef.current.add(c.id);
        startStream(c.id);
      }
    }
  }, [controls, startStream]);

  // Tear down every live stream on unmount (device disconnect re-renders the
  // widget tree, and the host tile unmounts the widget).
  useEffect(() => {
    const streams = streamsRef.current;
    return () => {
      for (const h of Object.values(streams)) void h.stop();
    };
  }, []);

  return { buttonState, consoleViews, displayValues, scriptError, onRun, onCopyConsole };
}
