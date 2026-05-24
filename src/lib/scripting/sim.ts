// Scripting widget — simulator backend for the no-device path.
//
// Arbitrary shell can't run in the browser, so the simulator evaluates a tiny
// subset: it finds the called function and emits its `echo` / `printf` lines
// with $VAR / ${VAR} substituted from the env. That keeps the demo path useful
// (an `echo "hi $NAME"` function shows real input) and gives e2e a
// deterministic, device-free result. Unknown functions report 127 like a shell
// would; functions with no echo lines report a friendly placeholder.

import { extractFunctionBody } from './parseScript';
import type { RunResult } from './runner';

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

export function runFunctionSim(
  script: string,
  fn: string,
  env: Record<string, string>,
): RunResult {
  const body = extractFunctionBody(script, fn);
  if (body == null) {
    return { stdout: '', stderr: `sh: ${fn}: not found`, exitCode: 127 };
  }
  // Find `echo`/`printf` statements anywhere — at line start, after `{`, or
  // after `;` — so inline one-liners like `f() { echo hi; }` simulate too. The
  // argument runs up to the next `;`, newline, or closing `}`.
  const out: string[] = [];
  const re = /(?:^|[\s;{])(?:echo|printf)\s+([^;\n}]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const arg = m[1].trim();
    if (!arg) continue;
    // Single-quoted args are literal; otherwise expand env references.
    const literal = arg.startsWith("'");
    const text = stripQuotes(arg);
    out.push(literal ? text : substEnv(text, env));
  }
  if (out.length === 0) {
    out.push(`[sim] ${fn} ran (no echo output to simulate)`);
  }
  return { stdout: out.join('\n'), stderr: '', exitCode: 0 };
}
