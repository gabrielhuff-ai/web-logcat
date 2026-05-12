// Shell widget — single interactive ADB shell scoped to one tile.
//
// Mostly per HANDOFF §Shell Widget. The original spec called for "no
// toolbar" but field testing surfaced two missing affordances: a
// restart button (recover from a wedged channel without removing /
// re-adding the tile) and a run-as-root toggle (Pixel/AOSP devices
// with `su` available). Both live on a slim `.sh-toolbar widget-bar`
// + the per-widget settings modal so the keyboard shortcut surface
// stays the prompt itself.
//
// Two backends, switched on `useAdb().usingFake`:
//   - Real device → `adb.subprocess.shellProtocol?.spawn([])` opens a
//     long-lived `shell:` channel. stdin comes from the input field;
//     stdout / stderr append to the scrollback (ANSI-stripped). On
//     widget unmount or device disconnect we kill the channel.
//   - Simulator   → `lib/shellSim.ts` runs the built-in command
//     allowlist in-memory so the no-phone demo path stays useful.
//
// The renderer is intentionally line-based — no `xterm.js`, no PTY
// emulation. CLAUDE.md forbids new runtime deps without approval, and
// a flat scrollback matches the design reference at
// `design/v2/source/widget-shell.jsx` pixel-for-pixel.

import '../../styles/widgets/shell.css';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { WritableStream } from '@yume-chan/stream-extra';
import * as Icons from '../Icons';
import { useAdb } from '../../lib/adbContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import {
  completeShellInput,
  completeShellInputReal,
  execShellSim,
  initialShellSimState,
  stripAnsi,
  type ShellSimState,
} from '../../lib/shellSim';
import { SHELL_DEFAULTS, type ShellSettings } from './shell/shellSettings';
import { markInternalDropConsumed } from '../../lib/dragHandoff';

/** Host segment shown in the prompt — matches the design reference. */
const SHELL_HOST = 'shiba';

/**
 * Sentinel pattern used to read the device's post-command cwd. We
 * append `printf '__WLC_CWD_%s__\n' "$(pwd)"` after any `cd` the user
 * runs and parse the marker out of stdout — that way the prompt only
 * updates when `cd` actually succeeded on-device (failure leaves
 * `pwd` at the previous directory). Without this we used to update
 * the prompt optimistically based on the simulator's path resolver,
 * which happily resolves non-existent paths.
 */
const CWD_MARKER_RE = /^__WLC_CWD_(.+)__$/;
const CWD_MARKER_SUFFIX = `; printf '__WLC_CWD_%s__\\n' "$(pwd)"`;
/** True for plain `cd` / `cd <target>` invocations (no pipes / chains). */
const SIMPLE_CD_RE = /^cd(\s+\S.*)?$/;

/** One row in the scrollback. */
type ShellLine =
  | { kind: 'system'; text: string }
  | { kind: 'prompt'; cwd: string; text: string }
  | { kind: 'out'; text: string };

export interface ShellWidgetProps {
  /** Stable id of the host tile — used to namespace per-instance state. */
  tileId: string;
}

/**
 * Minimal interface over `adb.subprocess.shellProtocol`'s spawn result.
 * Pulled out so the widget body doesn't need to import the yume-chan
 * type machinery — TypeScript will check the shape against
 * `Adb.subprocess.shellProtocol.spawn(...)` at the call site below.
 */
interface ShellChannel {
  write(text: string): Promise<void>;
  kill(): Promise<void>;
}

export function ShellWidget({ tileId }: ShellWidgetProps) {
  const { device, adb, usingFake } = useAdb();
  const { showToast } = useDashboardChrome();
  const [settings, setSettings] = useTileSettings<ShellSettings>(
    tileId,
    'shell',
    SHELL_DEFAULTS,
  );
  // Bumped to force the shell-channel effect to tear down and re-open
  // the underlying `shell:` socket. Used by the Restart button and
  // the Run-as-root toggle.
  const [restartCounter, setRestartCounter] = useState(0);

  const [history, setHistory] = useState<ShellLine[]>(() => initialBanner(device?.model));
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  // Sim state seeds from the configured home dir so a freshly mounted
  // shell on the simulator starts where the user expects.
  const [simState, setSimState] = useState<ShellSimState>(() => ({
    ...initialShellSimState(),
    cwd: settings.homeDir,
  }));
  // Live cwd shown in the prompt. Driven by the simulator state on the
  // fake path, and tracked client-side via `pwd` on the real path
  // (no clean way to read the device-side cwd without parsing PS1).
  const [cwd, setCwd] = useState<string>(() => settings.homeDir);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ShellChannel | null>(null);
  const channelKilledRef = useRef(false);
  // Stays in sync with `settings.homeDir` (see the effect lower down).
  // Used by the channel-open effect's `cd` call so a homeDir change
  // doesn't have to tear down + reopen the channel.
  const homeDirRef = useRef(settings.homeDir);

  // `appendLines` is a stable callback so it can live in the long-lived
  // shell-channel effect's dependency array without re-opening the
  // channel on every render. The `kind: 'prompt'` branch isn't used
  // here (prompts are appended synchronously by `submit`) — the
  // signature stays general for the stdout / system-banner callers.
  const appendLines = useCallback((lines: string[], kind: 'system' | 'out' = 'out') => {
    if (lines.length === 0) return;
    setHistory((prev) =>
      prev.concat(
        lines.map((text) =>
          kind === 'system' ? { kind: 'system', text } : { kind: 'out', text },
        ),
      ),
    );
  }, []);

  // ---- Auto-scroll on new content ----------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history]);

  // ---- Real channel lifecycle --------------------------------------------
  // Open one `shell:` channel per widget instance when there's a real
  // device + handle. Kill on unmount or when the handle goes away
  // (device disconnect re-renders the widget tree with `adb === null`).
  useEffect(() => {
    if (usingFake || !adb) {
      return;
    }
    const shellProtocol = adb.subprocess.shellProtocol;
    if (!shellProtocol) {
      // Devices that don't speak the shell-v2 protocol (very old ROMs)
      // would need the noneProtocol fallback. Surface the limitation
      // rather than silently failing — Phase 6 keeps scope tight.
      setHistory((prev) => prev.concat([
        {
          kind: 'system',
          text: 'Shell-protocol v2 not supported by this device. Update ADB on the device or reconnect.',
        },
      ]));
      return;
    }

    let cancelled = false;
    let killed = false;
    const encoder = new TextEncoder();

    const handle = (async () => {
      try {
        // Run-as-root spawns through `su`; the empty argv path stays
        // an interactive `shell:`. yume-chan accepts string-or-string[].
        const proc = await shellProtocol.spawn(
          settings.runAsRoot ? ['su'] : [],
        );
        if (cancelled) {
          await proc.kill();
          return null;
        }

        // Stream stdout + stderr into the scrollback. We don't bother
        // separating them visually — the design has a single column.
        // ANSI escapes are stripped before render.
        const stdoutWriter = new WritableStream<Uint8Array>({
          write(chunk) {
            const text = new TextDecoder().decode(chunk);
            const lines = text.split('\n');
            // Last fragment may be a partial line — keep it simple
            // and emit each chunk's lines verbatim. Good enough for
            // the line-based renderer.
            const out: string[] = [];
            for (const raw of lines) {
              if (raw === '' && lines.length === 1) continue;
              const cleaned = stripAnsi(raw);
              const m = CWD_MARKER_RE.exec(cleaned);
              if (m) {
                // Eat the marker line and update the prompt cwd to
                // whatever the device reports for `pwd` after the cd.
                setCwd(m[1]);
                continue;
              }
              out.push(cleaned);
            }
            if (out.length) appendLines(out, 'out');
          },
        });

        void proc.stdout.pipeTo(stdoutWriter).catch(() => {
          /* stream closed — ignored */
        });
        void proc.stderr.pipeTo(
          new WritableStream<Uint8Array>({
            write(chunk) {
              const text = new TextDecoder().decode(chunk);
              const out = text.split('\n').map(stripAnsi).filter((l) => l !== '');
              if (out.length) appendLines(out, 'out');
            },
          }),
        ).catch(() => {
          /* stream closed — ignored */
        });

        const stdinWriter = proc.stdin.getWriter();

        const channel: ShellChannel = {
          async write(text: string) {
            try {
              await stdinWriter.write(encoder.encode(text));
            } catch {
              /* channel closed mid-write — ignored */
            }
          },
          async kill() {
            if (killed) return;
            killed = true;
            try {
              stdinWriter.releaseLock();
            } catch {
              /* already released */
            }
            try {
              await proc.kill();
            } catch {
              /* already gone */
            }
          },
        };

        // When the remote process exits (user typed `exit` etc.) tell
        // the user — but only once.
        void proc.exited.then(() => {
          if (cancelled || channelKilledRef.current) return;
          appendLines(['(shell exited)'], 'system');
        });

        return channel;
      } catch (err) {
        if (cancelled) return null;
        const msg = err instanceof Error ? err.message : 'Failed to open shell';
        appendLines([`shell: ${msg}`], 'system');
        showToast(msg);
        return null;
      }
    })();

    void handle.then((ch) => {
      if (!cancelled) {
        channelRef.current = ch;
        // Send the initial `cd <homeDir>` once the channel is up so the
        // remote shell starts where the user wants it — and append the
        // CWD marker so the prompt updates from the device's actual
        // post-cd `pwd`. Without the marker the prompt sat at
        // `homeDir` even when the device refused the cd (homeDir
        // doesn't exist, perms denied), leaving the user typing into a
        // prompt that didn't match reality.
        if (ch) {
          const dir = homeDirRef.current;
          void ch.write(`cd ${dir}${CWD_MARKER_SUFFIX}\n`);
        }
      }
    });

    return () => {
      cancelled = true;
      channelKilledRef.current = true;
      void handle.then((ch) => {
        if (ch) void ch.kill();
      });
      channelRef.current = null;
    };
    // `restartCounter` is the deliberate dep that lets the Restart
    // button + the Run-as-root toggle tear down + reopen the channel
    // without remounting the widget. `settings.runAsRoot` is also
    // listed so a toggle change immediately re-runs the effect.
  }, [adb, usingFake, appendLines, showToast, restartCounter, settings.runAsRoot]);

  // ---- Submit one line ---------------------------------------------------
  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const cmd = input;
      const promptLine: ShellLine = { kind: 'prompt', cwd, text: cmd };

      if (usingFake || !adb) {
        // Simulator path — synchronous evaluation.
        const result = execShellSim(cmd, simState);
        if (result.clear) {
          setHistory([]);
        } else {
          setHistory((prev) =>
            prev.concat(
              [promptLine],
              result.lines.map<ShellLine>((text) => ({ kind: 'out', text })),
            ),
          );
        }
        if (cmd.trim()) setCmdHistory((h) => [...h, cmd]);
        setHistIdx(-1);
        setInput('');
        if (result.state.cwd !== simState.cwd) {
          setSimState(result.state);
          setCwd(result.state.cwd);
        } else {
          setSimState(result.state);
        }
        return;
      }

      // Real channel path — echo the prompt locally (the device's PS1
      // would otherwise paint a duplicate) and pipe the line to stdin.
      setHistory((prev) => prev.concat([promptLine]));
      if (cmd.trim()) setCmdHistory((h) => [...h, cmd]);
      setHistIdx(-1);
      setInput('');

      // Track cwd client-side: if the user typed a plain `cd <target>`,
      // append a printf-pwd sentinel so the prompt updates from the
      // device's *actual* post-cd `pwd` (not an optimistic local path
      // resolution). The sentinel line is intercepted in the stdout
      // reader above. For pipes / chains / other commands we don't
      // bother — keeping the prompt at the old cwd is correct in those
      // cases anyway.
      const trimmed = cmd.trim();
      const isSimpleCd = SIMPLE_CD_RE.test(trimmed);
      const wireCmd = isSimpleCd ? trimmed + CWD_MARKER_SUFFIX : cmd;
      void channelRef.current?.write(wireCmd + '\n');
    },
    [adb, cwd, input, simState, usingFake],
  );

  // ---- Key bindings on the input ----------------------------------------
  const onKey = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cmdHistory.length === 0) return;
        const next = histIdx === -1 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
        setHistIdx(next);
        setInput(cmdHistory[next]);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIdx === -1) return;
        const next = histIdx + 1;
        if (next >= cmdHistory.length) {
          setHistIdx(-1);
          setInput('');
        } else {
          setHistIdx(next);
          setInput(cmdHistory[next]);
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (usingFake) {
          // Simulator-side completion against `FAKE_FS_HINTS`. Single
          // match extends the word (with a trailing `/` for directories);
          // multiple matches extend to the longest common prefix and
          // print the candidates inline as a single space-separated row.
          const result = completeShellInput(input, simState);
          if (result.input !== input) setInput(result.input);
          if (result.options.length > 1) {
            const promptLine: ShellLine = { kind: 'prompt', cwd, text: input };
            const optionsLine: ShellLine = {
              kind: 'out',
              text: result.options.join('  '),
            };
            setHistory((prev) => prev.concat([promptLine, optionsLine]));
          }
        } else if (adb) {
          // Real device — there is no PTY on the shell-v2 channel, so
          // we can't ask the remote shell for completion. Instead we
          // run a side-channel `ls -1 -p -A <dir>` via a separate
          // shell subprocess, parse the listing client-side, and
          // apply the same extend-or-list logic as the simulator
          // path. Async — input updates land a tick or two after the
          // user pressed Tab, which still feels responsive over USB.
          const sp = adb.subprocess.shellProtocol;
          if (!sp) return;
          void (async () => {
            const result = await completeShellInputReal(
              input,
              cwd,
              async (dirAbs) => {
                try {
                  const out = await sp.spawnWaitText([
                    'ls',
                    '-1',
                    '-p',
                    '-A',
                    dirAbs,
                  ]);
                  if (out.exitCode !== 0) return null;
                  const entries: string[] = [];
                  const dirs = new Set<string>();
                  for (const raw of (out.stdout ?? '').split('\n')) {
                    const line = stripAnsi(raw).trim();
                    if (!line) continue;
                    if (line.endsWith('/')) {
                      const name = line.slice(0, -1);
                      entries.push(name);
                      dirs.add(name);
                    } else {
                      entries.push(line);
                    }
                  }
                  return { entries, dirs };
                } catch {
                  return null;
                }
              },
            );
            if (result.input !== input) setInput(result.input);
            if (result.options.length > 1) {
              const promptLine: ShellLine = { kind: 'prompt', cwd, text: input };
              const optionsLine: ShellLine = {
                kind: 'out',
                text: result.options.join('  '),
              };
              setHistory((prev) => prev.concat([promptLine, optionsLine]));
            }
          })();
        }
        return;
      }
      if (e.key.toLowerCase() === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setHistory([]);
        return;
      }
      // Decision: forward Ctrl+C / Ctrl+D to the real channel as the
      // raw control characters; on the simulator they're no-ops (the
      // sandbox commands all complete synchronously). The HANDOFF
      // doesn't specify either way; this matches what a real terminal
      // would do without dragging in PTY emulation.
      if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey)) {
        if (!usingFake && channelRef.current) {
          e.preventDefault();
          void channelRef.current.write('\x03');
          setInput('');
        }
        return;
      }
      if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
        if (!usingFake && channelRef.current && input === '') {
          e.preventDefault();
          void channelRef.current.write('\x04');
        }
        return;
      }
    },
    [adb, cmdHistory, cwd, histIdx, input, simState, usingFake],
  );

  // ---- Click anywhere in the body grabs focus ----------------------------
  const onWidgetClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Drag-from-Files handoff ------------------------------------------
  // Dropping a file row from the Files widget anywhere inside the
  // terminal area pastes its device-side path at the current caret of
  // the prompt input. The drop target is the whole `.sh-widget` (not
  // just the input) so the user doesn't have to aim at the prompt
  // line, which is a small slice of the tile. We also mark the drag
  // as "consumed in-app" so the Files widget skips its default
  // Pull-to-host download on `dragend`.
  const isDevicePathOrTextDrag = (e: React.DragEvent<HTMLElement>): boolean =>
    e.dataTransfer.types.includes('application/x-weblogcat-device-path') ||
    e.dataTransfer.types.includes('text/plain');
  const onShellDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isDevicePathOrTextDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onShellDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isDevicePathOrTextDrag(e)) return;
    e.preventDefault();
    const path =
      e.dataTransfer.getData('application/x-weblogcat-device-path') ||
      e.dataTransfer.getData('text/plain');
    if (!path) return;
    markInternalDropConsumed();
    const el = inputRef.current;
    // When the drop didn't land on the input, the caret position
    // isn't meaningful — append at end. Otherwise insert at the
    // current selection range so the user can wedge the path
    // between existing characters.
    const dropOnInput = el === e.target || el?.contains(e.target as Node);
    const start = dropOnInput ? el?.selectionStart ?? input.length : input.length;
    const end = dropOnInput ? el?.selectionEnd ?? input.length : input.length;
    const next = input.slice(0, start) + path + input.slice(end);
    setInput(next);
    // Restore focus + caret just after the inserted path.
    requestAnimationFrame(() => {
      const target = inputRef.current;
      if (!target) return;
      const caret = start + path.length;
      target.focus();
      try {
        target.setSelectionRange(caret, caret);
      } catch {
        /* selection ranges aren't always settable mid-drop — ignore */
      }
    });
  }, [input]);

  // The wrapper itself is focusable so the bars-hidden / focus-scoped
  // shortcut idiom (matches LogcatWidget) works even without an active
  // input — but we don't currently have any global shell shortcuts.
  const rootRef = useRef<HTMLDivElement>(null);

  // ---- Re-cd when the user changes the home dir mid-session ------------
  // The initial cd (right after spawn) lives in the channel-open
  // effect so it can't race the channel handle's async resolution.
  // This effect only fires on *subsequent* `settings.homeDir` edits,
  // when `channelRef.current` is already populated. We still append
  // the CWD marker so the prompt reflects the device's real post-cd
  // pwd (the new homeDir might not exist).
  //
  // The legacy `weblogcat:shell:<serial>:<tileId>:cwd` key is migrated
  // into `settings.homeDir` by the registered migration.
  useEffect(() => {
    homeDirRef.current = settings.homeDir;
  }, [settings.homeDir]);
  const homeDirInitialRef = useRef(settings.homeDir);
  useEffect(() => {
    if (usingFake || !adb) return;
    if (settings.homeDir === homeDirInitialRef.current) return;
    homeDirInitialRef.current = settings.homeDir;
    const ch = channelRef.current;
    if (!ch) return;
    void ch.write(`cd ${settings.homeDir}${CWD_MARKER_SUFFIX}\n`);
  }, [adb, usingFake, settings.homeDir]);

  const widgetStyle: CSSProperties = {
    ['--widget-font-size' as string]: `${settings.fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className="sh-widget"
      ref={rootRef}
      tabIndex={-1}
      onClick={onWidgetClick}
      onDragOver={onShellDragOver}
      onDrop={onShellDrop}
      style={widgetStyle}
    >
      <div className="sh-toolbar widget-bar">
        <button
          type="button"
          className="sh-icon-btn tt"
          data-tt="Restart shell"
          onClick={(e) => {
            e.stopPropagation();
            // Reset the scrollback to the banner so the user has clear
            // visual confirmation the channel was torn down. Without
            // this, the existing lines look identical pre/post-restart
            // and there's no way to tell the click landed.
            setHistory(initialBanner(device?.model));
            setRestartCounter((n) => n + 1);
          }}
          aria-label="Restart shell"
        >
          <Icons.Refresh size={13} />
        </button>
        <button
          type="button"
          className={`sh-pill tt ${settings.runAsRoot ? 'on' : ''}`}
          data-tt={
            settings.runAsRoot
              ? 'Running as root (toggle off to restart)'
              : 'Run as root (requires su)'
          }
          aria-pressed={settings.runAsRoot}
          onClick={(e) => {
            e.stopPropagation();
            // Toggling root respawns the channel through `su` (or back
            // to the user shell) — same UX guarantee as Restart, so
            // also clear the scrollback so the new prompt line lands
            // on a fresh banner.
            setHistory(initialBanner(device?.model));
            setSettings({ runAsRoot: !settings.runAsRoot });
          }}
        >
          root
        </button>
        <span style={{ flex: 1 }} />
      </div>
      <div className="sh-scroll" ref={scrollRef}>
        {history.map((line, i) => {
          if (line.kind === 'system') {
            return (
              <div key={i} className="sh-system">
                {line.text}
              </div>
            );
          }
          if (line.kind === 'prompt') {
            return (
              <div key={i} className="sh-line">
                <span className="sh-prompt-host">{SHELL_HOST}</span>
                <span className="sh-prompt-sep">:</span>
                <span className="sh-prompt-cwd">{line.cwd}</span>
                <span className="sh-prompt-sym"> {settings.runAsRoot ? '#' : '$'} </span>
                <span className="sh-cmd">{line.text}</span>
              </div>
            );
          }
          return (
            <div key={i} className="sh-line sh-out">
              {line.text}
            </div>
          );
        })}

        <form onSubmit={submit} className="sh-line sh-input-line">
          <span className="sh-prompt-host">{SHELL_HOST}</span>
          <span className="sh-prompt-sep">:</span>
          <span className="sh-prompt-cwd">{cwd}</span>
          <span className="sh-prompt-sym"> {settings.runAsRoot ? '#' : '$'} </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
            aria-label="Shell input"
          />
        </form>
      </div>
    </div>
  );
}

function initialBanner(model: string | undefined): ShellLine[] {
  return [
    { kind: 'system', text: `Connected to ${model ?? 'device'} via ADB shell` },
    { kind: 'system', text: `Type 'help' for available commands` },
  ];
}
