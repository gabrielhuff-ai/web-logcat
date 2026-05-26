// Scripting widget — one-shot, injection-safe function execution.
//
// The ADB shell-protocol transport sends a single command STRING (it joins any
// argv array with spaces and does no quoting — see @yume-chan/adb
// `shell,v2,raw:${command.join(" ")}`). So we build the command string
// ourselves and single-quote every input value, which keeps user values inert
// data rather than executable code:
//
//   PACKAGE='com.example'     # each input, single-quoted (literal)
//   <the whole script>        # defines the functions
//   info                      # call the chosen function
//
// Variable assignments and the function definitions run in the same shell, so
// the function sees the values via $PACKAGE. No shebang is required — the
// device runs the string in its own shell, and any `#!` line is just a comment.
// Run-as-root uses `su 0 sh -c '<escaped>'` — the `su <uid> <command…>` form
// both AOSP and Magisk `su` accept (`su -c` is treated as a uid by AOSP `su`).

import type { Adb } from '@yume-chan/adb';

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOpts {
  script: string;
  fn: string;
  env: Record<string, string>;
  runAsRoot: boolean;
}

/** Thrown when the device's ADB doesn't expose shell-protocol v2. */
export class ShellUnsupportedError extends Error {
  constructor() {
    super('Shell-protocol v2 not supported by this device.');
    this.name = 'ShellUnsupportedError';
  }
}

/** Wrap a string in single quotes, escaping any embedded single quotes. The
 *  result is a single shell word whose contents are taken literally. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Build the command string for a run. Pure — unit tested. */
export function buildCommand(opts: RunOpts): string {
  const { script, fn, env, runAsRoot } = opts;
  const assigns = Object.entries(env)
    .map(([k, v]) => `${k}=${shQuote(v)}`)
    .join('\n');
  // assignments → script (function defs) → call the function.
  const body = `${assigns ? assigns + '\n' : ''}${script}\n${fn}`;
  return runAsRoot ? `su 0 sh -c ${shQuote(body)}` : body;
}

/** Run one function against a real device. Throws ShellUnsupportedError on
 *  devices without shell-protocol v2. */
export async function runFunction(adb: Adb, opts: RunOpts): Promise<RunResult> {
  const sp = adb.subprocess.shellProtocol;
  if (!sp) throw new ShellUnsupportedError();
  const { stdout, stderr, exitCode } = await sp.spawnWaitText(buildCommand(opts));
  return { stdout, stderr, exitCode };
}

/**
 * Syntax-check the script with `sh -n` (parse, don't execute). Returns an
 * error message when invalid, or null when fine / unsupported. Passed as a
 * single quoted string so a multi-line script survives the transport intact.
 */
export async function checkScript(adb: Adb, script: string): Promise<string | null> {
  const sp = adb.subprocess.shellProtocol;
  if (!sp) return null;
  const { stderr, exitCode } = await sp.spawnWaitText(`sh -n -c ${shQuote(script)}`);
  if (exitCode === 0) return null;
  return stderr.trim() || 'Script has a syntax error.';
}
