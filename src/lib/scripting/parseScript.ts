// Scripting widget — light, dependency-free shell-script inspection.
//
// We deliberately don't ship a full shell parser. Two cheap, useful things:
//   - extractFunctions: the names of top-level function definitions, for the
//     builder legend, the "bind to" dropdowns, and stale-binding warnings.
//   - extractFunctionBody: a best-effort slice of one function's source for
//     the config "function preview".
//
// Authoritative syntax validation happens at run time via `sh -n` on the
// device (the runner) — this module is for UI affordances, so it errs toward
// not flagging rather than false positives. Comment lines are ignored.

// POSIX form: `name() {` or `name ()` (optionally brace on the next line).
const POSIX_FN = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{?/;
// ksh/bash form: `function name {` or `function name() {`.
const KEYWORD_FN = /^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\))?\s*\{?/;

function isComment(line: string): boolean {
  return /^\s*#/.test(line);
}

/** Ordered, de-duplicated list of function names defined in the script. */
export function extractFunctions(script: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of script.split('\n')) {
    if (isComment(raw)) continue;
    const line = raw.trim();
    const m = POSIX_FN.exec(line) ?? KEYWORD_FN.exec(line);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      names.push(m[1]);
    }
  }
  return names;
}

/** True when `name` is defined in the script. */
export function hasFunction(script: string, name: string): boolean {
  return extractFunctions(script).includes(name);
}

/**
 * Best-effort source of one function, from its definition line through the
 * matching closing brace (tracked by naive brace depth). Returns null when the
 * function isn't found. Good enough for a read-only preview — not a parser.
 */
export function extractFunctionBody(script: string, name: string): string | null {
  const lines = script.split('\n');
  // A definition line — either `function name [()]` or `name()`. Requiring
  // these markers avoids matching a plain call site like `name "$arg"`.
  const n = escapeRe(name);
  const defRe = new RegExp(`^\\s*(?:function\\s+${n}(?:\\s*\\(\\))?|${n}\\s*\\(\\))\\s*\\{?`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isComment(lines[i])) continue;
    if (defRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let seenOpen = false;
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        seenOpen = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    if (seenOpen && depth <= 0) break;
  }
  return out.join('\n');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
