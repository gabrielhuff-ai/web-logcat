// Scripting builder — pure text transforms for the script editor's keyboard
// shortcuts (Tab / Shift+Tab indent, Cmd/Ctrl+/ comment toggle). Each returns
// the new value plus the selection to restore, so the textarea handler stays a
// thin wrapper and the logic is unit-tested.

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Two-space indent — matches the script examples and the device shell style. */
const INDENT = '  ';

/** Expand [start, end] to the whole lines it touches. */
function lineBounds(value: string, start: number, end: number): { lineStart: number; lineEnd: number } {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = value.length;
  return { lineStart, lineEnd };
}

/** Tab: indent the selected lines, or insert one indent at a collapsed cursor. */
export function applyTab(value: string, start: number, end: number): EditResult {
  if (start !== end && value.slice(start, end).includes('\n')) {
    const { lineStart, lineEnd } = lineBounds(value, start, end);
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const block = lines.map((l) => INDENT + l).join('\n');
    return {
      value: value.slice(0, lineStart) + block + value.slice(lineEnd),
      selectionStart: start + INDENT.length,
      selectionEnd: end + INDENT.length * lines.length,
    };
  }
  // Collapsed or single-line selection: replace it with an indent.
  const pos = start + INDENT.length;
  return {
    value: value.slice(0, start) + INDENT + value.slice(end),
    selectionStart: pos,
    selectionEnd: pos,
  };
}

/** Shift+Tab: remove up to one indent (≤2 spaces or a tab) from each line. */
export function applyShiftTab(value: string, start: number, end: number): EditResult {
  const { lineStart, lineEnd } = lineBounds(value, start, end);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  let removedFirst = 0;
  let removedTotal = 0;
  const out = lines.map((l, i) => {
    const m = /^( {1,2}|\t)/.exec(l);
    if (!m) return l;
    if (i === 0) removedFirst = m[0].length;
    removedTotal += m[0].length;
    return l.slice(m[0].length);
  });
  const newStart = Math.max(lineStart, start - removedFirst);
  return {
    value: value.slice(0, lineStart) + out.join('\n') + value.slice(lineEnd),
    selectionStart: newStart,
    selectionEnd: Math.max(newStart, end - removedTotal),
  };
}

/** Cmd/Ctrl+/: toggle `#` comments on the selected lines. Comments when any
 *  non-blank line is uncommented; otherwise uncomments. The modified lines are
 *  left selected. Blank lines are untouched. */
export function toggleComment(value: string, start: number, end: number): EditResult {
  const { lineStart, lineEnd } = lineBounds(value, start, end);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const nonBlank = lines.filter((l) => l.trim() !== '');
  const allCommented = nonBlank.length > 0 && nonBlank.every((l) => /^\s*#/.test(l));

  const out = lines.map((l) => {
    if (l.trim() === '') return l;
    if (allCommented) {
      const m = /^(\s*)#[ \t]?/.exec(l);
      return m ? m[1] + l.slice(m[0].length) : l;
    }
    const ws = /^\s*/.exec(l)?.[0] ?? '';
    return `${ws}# ${l.slice(ws.length)}`;
  });
  const block = out.join('\n');
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
}
