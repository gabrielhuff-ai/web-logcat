import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderMarkdown } from './markdown';

function el(node: unknown): ReactElement {
  if (!isValidElement(node)) throw new Error('expected a React element');
  return node;
}

describe('renderMarkdown', () => {
  it('passes plain text through', () => {
    expect(renderMarkdown('just text')).toEqual(['just text']);
  });

  it('renders bold / italic / code as the right elements', () => {
    const [pre, b] = renderMarkdown('hi **there**');
    expect(pre).toBe('hi ');
    expect(el(b).type).toBe('strong');
    expect(el(b).props.children).toBe('there');
    expect(el(renderMarkdown('*x*')[0]).type).toBe('em');
    expect(el(renderMarkdown('`code`')[0]).type).toBe('code');
  });

  it('renders safe links as anchors with a target', () => {
    const a = el(renderMarkdown('[docs](https://example.com/x)')[0]);
    expect(a.type).toBe('a');
    expect(a.props.href).toBe('https://example.com/x');
    expect(a.props.target).toBe('_blank');
    expect(a.props.children).toBe('docs');
  });

  it('refuses javascript: (and other unsafe) URLs — no anchor is produced', () => {
    const nodes = renderMarkdown('[x](javascript:alert(1))');
    expect(nodes.some((n) => isValidElement(n) && n.type === 'a')).toBe(false);
  });

  it('allows relative links', () => {
    expect(el(renderMarkdown('[a](/docs/x)')[0]).props.href).toBe('/docs/x');
  });
});
