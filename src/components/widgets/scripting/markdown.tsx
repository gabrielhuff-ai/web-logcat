// Scripting widget — a tiny, dependency-free inline-markdown renderer for
// control / section descriptions. Supports **bold**, *italic*, `code`, and
// [links](https://…). Builds React nodes directly (never innerHTML) and only
// allows http(s)/mailto/relative hrefs, so an imported panel's description
// can't inject markup or javascript: URLs.

import type { ReactNode } from 'react';

const INLINE =
  /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function safeHref(href: string): string | null {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^\/(?!\/)/.test(href) || /^\.\.?\//.test(href)) return href; // relative path
  return null;
}

/** Render a markdown-ish string to React nodes. */
export function renderMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] != null) out.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] != null) out.push(<code key={key++}>{m[3]}</code>);
    else if (m[4] != null) {
      const href = safeHref(m[5]);
      out.push(
        href ? (
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
            {m[4]}
          </a>
        ) : (
          m[0]
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
