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
  execShellSim,
  initialShellSimState,
  stripAnsi,
  type ShellSimState,
} from '../../lib/shellSim';
import { SHELL_DEFAULTS, type ShellSettings } from './shell/shellSettings';

/** Host segment shown in the prompt — matches the design reference. */
const SHELL_HOST = 'shiba';

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
              out.push(stripAnsi(raw));
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
      if (!cancelled) channelRef.current = ch;
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

      // Track cwd client-side: if the user typed `cd <target>`, run the
      // simulator's path resolver to keep the prompt in sync. Best
      // effort — anything more elaborate would require parsing the
      // device's PS1, which is out of scope.
      const trimmed = cmd.trim();
      if (trimmed.startsWith('cd ') || trimmed === 'cd') {
        const sim = execShellSim(trimmed, { cwd });
        setCwd(sim.state.cwd);
      }

      void channelRef.current?.write(cmd + '\n');
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
        // Default browser behaviour is to move focus out of the
        // input (and on to the address bar in Chrome's case). Always
        // swallow it. On a real device we forward a literal tab to
        // the channel so any shell that *does* implement completion
        // (e.g. a custom rooted ROM with bash) sees the keystroke.
        // The simulator currently has no completion implementation —
        // the keystroke is dropped after `preventDefault()`.
        e.preventDefault();
        if (!usingFake && channelRef.current) {
          void channelRef.current.write('\t');
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
    [cmdHistory, histIdx, input, usingFake],
  );

  // ---- Click anywhere in the body grabs focus ----------------------------
  const onWidgetClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // The wrapper itself is focusable so the bars-hidden / focus-scoped
  // shortcut idiom (matches LogcatWidget) works even without an active
  // input — but we don't currently have any global shell shortcuts.
  const rootRef = useRef<HTMLDivElement>(null);

  // ---- Send `cd <homeDir>` on real-channel spawn -----------------------
  // The legacy `weblogcat:shell:<serial>:<tileId>:cwd` key is migrated
  // into `settings.homeDir` by the registered migration. On real
  // devices we send a `cd <homeDir>` once the channel is up so the
  // remote shell starts where the user wants it.
  const homeDirRef = useRef(settings.homeDir);
  useEffect(() => {
    homeDirRef.current = settings.homeDir;
  }, [settings.homeDir]);
  useEffect(() => {
    if (usingFake || !adb) return;
    const ch = channelRef.current;
    if (!ch) return;
    void ch.write(`cd ${homeDirRef.current}\n`);
    setCwd(homeDirRef.current);
    // Re-send when the user changes the home dir mid-session.
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
      style={widgetStyle}
    >
      <div className="sh-toolbar widget-bar">
        <button
          type="button"
          className="sh-icon-btn tt"
          data-tt="Restart shell"
          onClick={(e) => {
            e.stopPropagation();
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
                <span className="sh-prompt-sym"> $ </span>
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
          <span className="sh-prompt-sym"> $ </span>
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
