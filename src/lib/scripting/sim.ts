// Scripting widget — simulator backend for the no-device path.
//
// Arbitrary shell can't run in the browser, so the simulator evaluates a tiny
// subset: it finds the called function and emits its `echo` / `printf` lines
// with $VAR / ${VAR} substituted from the env. That keeps the demo path useful
// (an `echo "hi $NAME"` function shows real input) and gives e2e a
// deterministic, device-free result. Unknown functions report 127 like a shell
// would; functions with no echo lines report a friendly placeholder.
//
// `echo -e` interprets backslash escapes (\n, \t, \e / \033 / \x1b) so the
// demo can show ANSI colours and multi-line output, matching a real device.

import { extractFunctionBody } from './parseScript';
import type { RunResult, StreamLineKind } from './runner';

/** Substitute $NAME and ${NAME} from env; unknown vars become empty. */
export function substEnv(s: string, env: Record<string, string>): string {
  return s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, a, b) => {
    const name = a ?? b;
    return env[name] ?? '';
  });
}

/** Strip one layer of matching surrounding quotes from a token string. */
function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Interpret the backslash escapes that `echo -e` / `printf` expand. */
export function interpretEscapes(s: string): string {
  return s.replace(/\\(x1[bB]|033|e|E|n|t|r|\\)/g, (_m, code: string) => {
    switch (code) {
      case 'e':
      case 'E':
      case '033':
      case 'x1b':
      case 'x1B':
        return '\x1b';
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '\\':
        return '\\';
      default:
        return _m;
    }
  });
}

export interface SimLine {
  text: string;
  kind: StreamLineKind;
}

/**
 * The lines a function would print, or null when the function isn't defined.
 * Shared by the one-shot and streaming simulators. `clear` / `reset` emit a
 * screen-clear sequence (the console honours it); `echo` / `printf` emit their
 * (env-substituted, optionally escape-interpreted) argument.
 */
export function simLines(
  script: string,
  fn: string,
  env: Record<string, string>,
): SimLine[] | null {
  const body = extractFunctionBody(script, fn);
  if (body == null) return null;
  // Find `echo`/`printf`/`clear`/`reset` statements anywhere — at line start,
  // after `{`, or after `;` — so inline one-liners like `f() { echo hi; }`
  // simulate too. The argument runs up to the next `;`, newline, or `}`.
  const out: SimLine[] = [];
  const re = /(?:^|[\s;{])(echo|printf|clear|reset)\b([^;\n}]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === 'clear' || m[1] === 'reset') {
      out.push({ text: '\x1b[2J', kind: 'out' });
      continue;
    }
    let arg = m[2].trim();
    if (!arg) continue;
    // Peel leading `-e` / `-n` flags; `-e` enables escape interpretation.
    let interpret = false;
    const flag = /^(-[enE]+)\s+/.exec(arg);
    if (flag) {
      if (flag[1].includes('e')) interpret = true;
      arg = arg.slice(flag[0].length);
    }
    // Single-quoted args are literal; otherwise expand env references.
    const literal = arg.startsWith("'");
    let text = stripQuotes(arg);
    if (!literal) text = substEnv(text, env);
    if (interpret) text = interpretEscapes(text);
    // One `echo` can print multiple lines once `\n` is interpreted.
    for (const line of text.split('\n')) out.push({ text: line, kind: 'out' });
  }
  if (out.length === 0) {
    out.push({ text: `[sim] ${fn} ran (no echo output to simulate)`, kind: 'out' });
  }
  return out;
}

/**
 * Whether a function would run forever rather than return — the only case a
 * simulated daemon should keep emitting. A real shell function returns once it
 * reaches its end, so the sim finishes it; we only loop when the body has a
 * shell loop (`… do … done`) or a never-returning command (`logcat` live,
 * `tail -f`, `top`).
 */
export function loopsForever(body: string): boolean {
  if (/(?:^|[;\n])[ \t]*done\b/m.test(body)) return true; // while / until / for loop
  if (/\btail\b[^\n;]*-f\b/.test(body)) return true; // tail -f
  if (/\btop\b/.test(body)) return true;
  // logcat that isn't a one-shot dump (`-d`) or bounded tail (`-t`).
  if (/\blogcat\b/.test(body) && !/\blogcat\b[^\n;|&]*-[a-zA-Z]*[dt]/.test(body)) return true;
  return false;
}

export function runFunctionSim(
  script: string,
  fn: string,
  env: Record<string, string>,
): RunResult {
  const lines = simLines(script, fn, env);
  if (lines == null) {
    return { stdout: '', stderr: `sh: ${fn}: not found`, exitCode: 127 };
  }
  return { stdout: lines.map((l) => l.text).join('\n'), stderr: '', exitCode: 0 };
}

export interface SimStreamHandlers {
  onLine: (text: string, kind: StreamLineKind) => void;
  onExit?: (code: number) => void;
}

export interface SimStreamHandle {
  stop: () => void;
}

/**
 * Stream a function's simulated output on a timer. A finite function emits its
 * output once and then finishes (exit 0, or an explicit `exit [code]`), like a
 * real shell function returning; only a function that would run forever (a
 * loop, or `logcat`/`tail -f`/`top`) keeps looping so the console scrolls.
 * Returns a handle whose stop() cancels the timer. An unknown function emits
 * one error line and exits 127.
 */
export function streamFunctionSim(
  script: string,
  fn: string,
  env: Record<string, string>,
  handlers: SimStreamHandlers,
  intervalMs = 700,
): SimStreamHandle {
  const lines = simLines(script, fn, env);
  if (lines == null) {
    handlers.onLine(`sh: ${fn}: not found`, 'err');
    handlers.onExit?.(127);
    return { stop: () => {} };
  }
  const body = extractFunctionBody(script, fn) ?? '';
  // Decide how the run ends: an explicit `exit [code]` wins; otherwise a
  // never-returning function loops (finishCode null) and everything else
  // finishes cleanly after one pass.
  const exitMatch = /\bexit\b[ \t]*(\d*)/.exec(body);
  const finishCode = exitMatch
    ? exitMatch[1] === ''
      ? 0
      : Number(exitMatch[1])
    : loopsForever(body)
      ? null
      : 0;

  let i = 0;
  let done = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    done = true;
    if (timer) clearInterval(timer);
  };
  const tick = () => {
    if (done) return;
    const line = lines[i % lines.length];
    handlers.onLine(line.text, line.kind);
    i += 1;
    if (finishCode !== null && i >= lines.length) {
      stop();
      handlers.onExit?.(finishCode);
    }
  };
  // Emit the first line promptly so the console isn't blank, then keep going.
  tick();
  if (!done) timer = setInterval(tick, intervalMs);
  return { stop };
}
