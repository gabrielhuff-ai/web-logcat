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

  it('handles blink, reverse, and strikethrough attributes', () => {
    expect(parseAnsi(`${ESC}[5mblink`)[0].classes).toEqual(['sc-ansi-blink']);
    expect(parseAnsi(`${ESC}[9mstrike`)[0].classes).toEqual(['sc-ansi-strike']);
    // Reverse with no explicit colours swaps the console's default fg/bg.
    expect(parseAnsi(`${ESC}[7mrev`)[0].classes).toEqual(['sc-ansi-fg-default-bg', 'sc-ansi-bg-default-fg']);
    // Reverse with a foreground turns it into the background.
    expect(parseAnsi(`${ESC}[31;7mrev`)[0].classes).toEqual(['sc-ansi-fg-default-bg', 'sc-ansi-bg-red']);
  });

  it('combines codes carried in one sequence (e.g. \\e[1;4;35m)', () => {
    expect(parseAnsi(`${ESC}[1;4;35mx`)[0].classes).toEqual([
      'sc-ansi-fg-magenta',
      'sc-ansi-bold',
      'sc-ansi-underline',
    ]);
  });

  it('maps a 16-colour 256-palette code to a class', () => {
    expect(parseAnsi(`${ESC}[38;5;2mgreen`)[0].classes).toEqual(['sc-ansi-fg-green']);
  });

  it('renders 256-cube and truecolour as inline rgb()', () => {
    expect(parseAnsi(`${ESC}[38;5;208morange`)[0].style).toEqual({ color: 'rgb(255, 135, 0)' });
    expect(parseAnsi(`${ESC}[38;2;255;105;180mpink`)[0].style).toEqual({ color: 'rgb(255, 105, 180)' });
    // A 256 background + truecolour foreground in one run.
    const segs = parseAnsi(`${ESC}[48;5;236m${ESC}[38;5;220mgold`);
    expect(segs[0].style).toEqual({ background: 'rgb(48, 48, 48)', color: 'rgb(255, 215, 0)' });
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
