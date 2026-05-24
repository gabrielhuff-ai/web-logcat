// Scripting widget — one-shot, injection-safe function execution.
//
// Every run re-sources the whole script and calls one function, with input
// values supplied as environment variables. The command is built as argv
// tokens for `env` + `sh -c`, never by concatenating user values into the
// command string, so a value like `; rm -rf /` is inert data, not code:
//
//   env NAME=value … sh -c '<script>\n"$1"' weblogcat <fn>
//
// `$0` is `weblogcat`, `$1` is the function name, and `"$1"` invokes the
// function by name (command lookup resolves shell functions). Run-as-root
// prefixes `su 0` (Magisk/AOSP argv form) — best-effort per the panel setting.

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

/** Build the argv for a run. Pure — unit tested. */
export function buildRunArgv(opts: RunOpts): string[] {
  const { script, fn, env, runAsRoot } = opts;
  const envPairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  // Re-source the script, then invoke the function named by $1.
  const command = `${script}\n"$1"`;
  const base = ['env', ...envPairs, 'sh', '-c', command, 'weblogcat', fn];
  return runAsRoot ? ['su', '0', ...base] : base;
}

/** Run one function against a real device. Throws ShellUnsupportedError on
 *  devices without shell-protocol v2. */
export async function runFunction(adb: Adb, opts: RunOpts): Promise<RunResult> {
  const sp = adb.subprocess.shellProtocol;
  if (!sp) throw new ShellUnsupportedError();
  const { stdout, stderr, exitCode } = await sp.spawnWaitText(buildRunArgv(opts));
  return { stdout, stderr, exitCode };
}

/**
 * Syntax-check the script with `sh -n` (parse, don't execute). Returns an
 * error message when invalid, or null when fine / unsupported. This is the
 * authoritative parse check (the client-side parser only powers UI hints).
 */
export async function checkScript(adb: Adb, script: string): Promise<string | null> {
  const sp = adb.subprocess.shellProtocol;
  if (!sp) return null;
  const { stderr, exitCode } = await sp.spawnWaitText(['sh', '-n', '-c', script]);
  if (exitCode === 0) return null;
  return stderr.trim() || 'Script has a syntax error.';
}
