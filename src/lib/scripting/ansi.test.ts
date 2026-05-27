import { describe, expect, it } from 'vitest';
import { hasAnsi, parseAnsi, takeAfterClear } from './ansi';

const ESC = '\x1b';

describe('parseAnsi', () => {
  it('returns a single plain segment for text with no escapes', () => {
    expect(parseAnsi('plain text')).toEqual([{ text: 'plain text', classes: [] }]);
  });

  it('colours a foreground span and resets after it', () => {
    const segs = parseAnsi(`${ESC}[31mred${ESC}[0m tail`);
    expect(segs).toEqual([
      { text: 'red', classes: ['sc-ansi-fg-red'] },
      { text: ' tail', classes: [] },
    ]);
  });

  it('maps the standard 8 + bright foreground colours', () => {
    expect(parseAnsi(`${ESC}[32mok`)[0].classes).toEqual(['sc-ansi-fg-green']);
    expect(parseAnsi(`${ESC}[33mwarn`)[0].classes).toEqual(['sc-ansi-fg-yellow']);
    expect(parseAnsi(`${ESC}[91mbright`)[0].classes).toEqual(['sc-ansi-fg-bright-red']);
  });

  it('stacks attributes (bold + underline + colour)', () => {
    const segs = parseAnsi(`${ESC}[1;4;34mhi`);
    expect(segs[0].classes).toEqual(['sc-ansi-fg-blue', 'sc-ansi-bold', 'sc-ansi-underline']);
  });

  it('treats an empty SGR (\\e[m) as a reset', () => {
    const segs = parseAnsi(`${ESC}[1mbold${ESC}[mplain`);
    expect(segs).toEqual([
      { text: 'bold', classes: ['sc-ansi-bold'] },
      { text: 'plain', classes: [] },
    ]);
  });

  it('renders a background colour', () => {
    expect(parseAnsi(`${ESC}[41mx`)[0].classes).toEqual(['sc-ansi-bg-red']);
  });

  it('maps a 16-colour 256-palette code and ignores truecolour', () => {
    expect(parseAnsi(`${ESC}[38;5;2mgreen`)[0].classes).toEqual(['sc-ansi-fg-green']);
    // Truecolour operands are consumed, not mis-read as further codes.
    expect(parseAnsi(`${ESC}[38;2;10;20;30mtc`)[0].classes).toEqual([]);
  });

  it('strips non-SGR escape sequences (cursor moves, OSC)', () => {
    expect(parseAnsi(`${ESC}[2Kcleared`)).toEqual([{ text: 'cleared', classes: [] }]);
    expect(parseAnsi(`${ESC}]0;title${'\x07'}body`)).toEqual([{ text: 'body', classes: [] }]);
  });

  it('passes emoji and other multi-byte characters through unharmed', () => {
    const segs = parseAnsi(`${ESC}[32m✅ heartbeat 🎉${ESC}[0m`);
    expect(segs).toEqual([{ text: '✅ heartbeat 🎉', classes: ['sc-ansi-fg-green'] }]);
    // And plainly, with no escapes around them.
    expect(parseAnsi('✅ 🐢 🔥')).toEqual([{ text: '✅ 🐢 🔥', classes: [] }]);
  });

  it('coalesces adjacent text with identical styling', () => {
    const segs = parseAnsi(`${ESC}[31ma${ESC}[31mb`);
    expect(segs).toEqual([{ text: 'ab', classes: ['sc-ansi-fg-red'] }]);
  });
});

describe('hasAnsi', () => {
  it('detects escape sequences', () => {
    expect(hasAnsi(`${ESC}[31mx`)).toBe(true);
    expect(hasAnsi('plain')).toBe(false);
  });
});

describe('takeAfterClear', () => {
  it('passes plain text through untouched', () => {
    expect(takeAfterClear('hello')).toEqual({ cleared: false, rest: 'hello' });
  });

  it('detects CSI 2J / 3J and returns what follows', () => {
    expect(takeAfterClear(`old${ESC}[2Jnew`)).toEqual({ cleared: true, rest: 'new' });
    expect(takeAfterClear(`${ESC}[3J`)).toEqual({ cleared: true, rest: '' });
  });

  it('detects the RIS full reset (ESC c)', () => {
    expect(takeAfterClear(`${ESC}cfresh`)).toEqual({ cleared: true, rest: 'fresh' });
  });

  it('keeps only the text after the last clear', () => {
    expect(takeAfterClear(`a${ESC}[2Jb${ESC}[2Jc`)).toEqual({ cleared: true, rest: 'c' });
  });

  it('leaves a trailing cursor-home for the SGR parser to strip', () => {
    // `printf '\033[2J\033[H'` → clear, then the rest still carries ESC[H.
    expect(takeAfterClear(`${ESC}[2J${ESC}[H`)).toEqual({ cleared: true, rest: `${ESC}[H` });
  });
});
