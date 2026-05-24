import { describe, expect, it } from 'vitest';
import { highlightShell } from './highlight';

describe('highlightShell', () => {
  it('highlights comments', () => {
    expect(highlightShell('# hi')).toBe('<span class="hl-cmt"># hi</span>');
  });

  it('highlights a function definition name at line start', () => {
    expect(highlightShell('info() {')).toContain('<span class="hl-fn">info</span>()');
  });

  it('highlights $VARs, including inside double-quoted strings', () => {
    const html = highlightShell('echo "hi $NAME"');
    expect(html).toContain('hl-str');
    expect(html).toContain('<span class="hl-var">$NAME</span>');
  });

  it('keeps single-quoted strings literal (no var expansion)', () => {
    const html = highlightShell("echo '$NAME'");
    expect(html).toContain('<span class="hl-str">');
    // The $NAME stays inside the string span, not a separate var span.
    expect(html).not.toContain('<span class="hl-var">$NAME</span>');
  });

  it('escapes HTML so the script can never inject markup', () => {
    const html = highlightShell('cat 2>/dev/null && echo <b>');
    expect(html).toContain('&gt;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('preserves line count for gutter alignment', () => {
    expect(highlightShell('a\nb\nc').split('\n')).toHaveLength(3);
    expect(highlightShell('a\n').split('\n')).toHaveLength(2);
  });

  it('does not corrupt inserted markup with later tokens', () => {
    // A keyword-like substring inside a class name must not be re-wrapped.
    const html = highlightShell('# for');
    expect(html).toBe('<span class="hl-cmt"># for</span>');
  });
});
