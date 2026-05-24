// Scripting widget — minimal shell syntax highlighter for the builder editor.
//
// Produces an HTML string (escaped) with <span class="hl-…"> tokens that paints
// behind the transparent <textarea>. Single left-to-right pass per line so
// inserted markup is never re-scanned (avoids corrupting class attributes);
// double-quoted strings additionally get their $VARs highlighted, single-quoted
// strings stay literal (matching shell semantics). Not a real parser — just
// enough to read a panel script at a glance.

const VAR = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/g;
const KEYWORDS = 'if|then|else|elif|fi|for|while|do|done|in|case|esac|return|local|set';
// Ordered alternation: comment | dq-string | sq-string | var | keyword.
const TOKEN = new RegExp(
  `(#.*)|("[^"]*")|('[^']*')|(\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?)|\\b(${KEYWORDS})\\b`,
  'g',
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightLine(line: string): string {
  const esc = escapeHtml(line);
  let html = esc.replace(TOKEN, (m, cmt, dq, sq, v, kw) => {
    if (cmt != null) return `<span class="hl-cmt">${m}</span>`;
    if (dq != null) {
      const inner = m.replace(VAR, (vm: string) => `<span class="hl-var">${vm}</span>`);
      return `<span class="hl-str">${inner}</span>`;
    }
    if (sq != null) return `<span class="hl-str">${m}</span>`;
    if (v != null) return `<span class="hl-var">${m}</span>`;
    if (kw != null) return `<span class="hl-kw">${m}</span>`;
    return m;
  });
  // Function definition at line start: `name()`.
  html = html.replace(
    /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\(\))/,
    '$1<span class="hl-fn">$2</span>$3',
  );
  return html;
}

/** Highlight a whole script, preserving line count (1:1 with the textarea). */
export function highlightShell(src: string): string {
  return src.split('\n').map(highlightLine).join('\n');
}
