// Scripting console — ANSI SGR ("colour") parsing.
//
// Turns a line that may contain ANSI escape sequences into styled segments
// the console renders as <span>s. We handle the common SGR codes — the 8 + 8
// bright foreground/background colours, 256-colour and 24-bit truecolour, and
// bold / dim / italic / underline / blink / reverse / strikethrough — and
// silently strip every other escape (cursor moves, OSC, etc.) so a stray
// sequence shows as nothing rather than as garbage bytes. The 16 named colours
// map to theme-adaptive CSS classes; 256/truecolour map to an inline rgb().
//
// Parsing is per-line and stateless across calls: a colour set on one line
// does not bleed into the next. That matches the line-based console renderer
// and the overwhelmingly common `echo -e "\e[31m…\e[0m"` usage, which resets
// within the line. Non-ASCII (emoji, CJK) passes straight through — we only
// ever cut the string around escape sequences, never inside a character.

export interface AnsiStyle {
  color?: string;
  background?: string;
}
export interface AnsiSegment {
  text: string;
  /** CSS class names to apply to this segment's span (empty ⇒ plain text). */
  classes: string[];
  /** Inline colours for 256/truecolour, which can't be a fixed class. */
  style?: AnsiStyle;
}

const FG_NAMES: Record<number, string> = {
  30: 'black',
  31: 'red',
  32: 'green',
  33: 'yellow',
  34: 'blue',
  35: 'magenta',
  36: 'cyan',
  37: 'white',
};

// A colour is either one of the 16 named palette entries (→ CSS class) or a
// concrete rgb() string (256-colour / truecolour → inline style).
type Color = { kind: 'name'; name: string } | { kind: 'css'; css: string };

// Sentinels for reverse video: the unset side defaults to the console's own
// foreground / background so `\e[7m` with no colours still swaps.
const DEFAULT_FG: Color = { kind: 'name', name: 'default-fg' };
const DEFAULT_BG: Color = { kind: 'name', name: 'default-bg' };

/** Map an xterm 256-colour index to a Color (0-15 named, else an rgb cube/grey). */
function color256(n: number): Color {
  if (n >= 0 && n <= 7) return { kind: 'name', name: FG_NAMES[n + 30] };
  if (n >= 8 && n <= 15) return { kind: 'name', name: `bright-${FG_NAMES[n + 22]}` };
  if (n >= 232 && n <= 255) {
    const v = 8 + (n - 232) * 10;
    return { kind: 'css', css: `rgb(${v}, ${v}, ${v})` };
  }
  const i = n - 16;
  const cube = [0, 95, 135, 175, 215, 255];
  return {
    kind: 'css',
    css: `rgb(${cube[Math.floor(i / 36) % 6]}, ${cube[Math.floor(i / 6) % 6]}, ${cube[i % 6]})`,
  };
}

interface SgrState {
  fg: Color | null;
  bg: Color | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  reverse: boolean;
  strike: boolean;
}

function emptyState(): SgrState {
  return {
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    reverse: false,
    strike: false,
  };
}

/** Resolve the running state into the classes + inline style for a span. */
function styleFor(s: SgrState): { classes: string[]; style?: AnsiStyle } {
  // Reverse swaps fg/bg; an unset side falls back to the console default so a
  // bare `\e[7m` still inverts.
  let fg = s.fg;
  let bg = s.bg;
  if (s.reverse) {
    const srcFg = s.fg ?? DEFAULT_FG;
    const srcBg = s.bg ?? DEFAULT_BG;
    fg = srcBg;
    bg = srcFg;
  }

  const classes: string[] = [];
  const style: AnsiStyle = {};
  if (fg) {
    if (fg.kind === 'name') classes.push(`sc-ansi-fg-${fg.name}`);
    else style.color = fg.css;
  }
  if (bg) {
    if (bg.kind === 'name') classes.push(`sc-ansi-bg-${bg.name}`);
    else style.background = bg.css;
  }
  if (s.bold) classes.push('sc-ansi-bold');
  if (s.dim) classes.push('sc-ansi-dim');
  if (s.italic) classes.push('sc-ansi-italic');
  if (s.underline) classes.push('sc-ansi-underline');
  if (s.strike) classes.push('sc-ansi-strike');
  if (s.blink) classes.push('sc-ansi-blink');

  return style.color != null || style.background != null ? { classes, style } : { classes };
}

/** Apply one parsed SGR sequence (its numeric params) to the running state. */
function applySgr(state: SgrState, params: number[]): void {
  // An empty `\e[m` is the same as `\e[0m` (reset).
  const codes = params.length === 0 ? [0] : params;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) Object.assign(state, emptyState());
    else if (c === 1) state.bold = true;
    else if (c === 2) state.dim = true;
    else if (c === 3) state.italic = true;
    else if (c === 4) state.underline = true;
    else if (c === 5 || c === 6) state.blink = true;
    else if (c === 7) state.reverse = true;
    else if (c === 9) state.strike = true;
    else if (c === 22) {
      state.bold = false;
      state.dim = false;
    } else if (c === 23) state.italic = false;
    else if (c === 24) state.underline = false;
    else if (c === 25) state.blink = false;
    else if (c === 27) state.reverse = false;
    else if (c === 29) state.strike = false;
    else if (c >= 30 && c <= 37) state.fg = { kind: 'name', name: FG_NAMES[c] };
    else if (c >= 40 && c <= 47) state.bg = { kind: 'name', name: FG_NAMES[c - 10] };
    else if (c >= 90 && c <= 97) state.fg = { kind: 'name', name: `bright-${FG_NAMES[c - 60]}` };
    else if (c >= 100 && c <= 107) state.bg = { kind: 'name', name: `bright-${FG_NAMES[c - 70]}` };
    else if (c === 39) state.fg = null;
    else if (c === 49) state.bg = null;
    else if (c === 38 || c === 48) {
      // Extended colour: `38;5;n` (256) or `38;2;r;g;b` (truecolour). Consume
      // the operands so they aren't mistaken for further SGR codes.
      const target: 'fg' | 'bg' = c === 38 ? 'fg' : 'bg';
      const mode = codes[i + 1];
      if (mode === 5) {
        const idx = codes[i + 2];
        i += 2;
        state[target] = idx >= 0 && idx <= 255 ? color256(idx) : null;
      } else if (mode === 2) {
        const r = codes[i + 2] || 0;
        const g = codes[i + 3] || 0;
        const b = codes[i + 4] || 0;
        i += 4;
        state[target] = { kind: 'css', css: `rgb(${r}, ${g}, ${b})` };
      }
    }
  }
}

function sameSpan(prev: AnsiSegment, classes: string[], style?: AnsiStyle): boolean {
  if (prev.classes.length !== classes.length) return false;
  for (let i = 0; i < classes.length; i++) if (prev.classes[i] !== classes[i]) return false;
  return prev.style?.color === style?.color && prev.style?.background === style?.background;
}

// CSI sequence: ESC [ <params> <final letter @-~>. We act on the SGR final
// ('m') and strip every other final. OSC (ESC ] … BEL/ST) is stripped too.
// eslint-disable-next-line no-control-regex
const ESC_SEQ = /\x1B\[([0-?]*)[ -/]*([@-~])|\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;

/** Parse a single line into styled segments. Adjacent text with the same
 *  style is coalesced; empty-text segments are dropped. */
export function parseAnsi(line: string): AnsiSegment[] {
  const state = emptyState();
  const segments: AnsiSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  const push = (text: string) => {
    if (!text) return;
    const { classes, style } = styleFor(state);
    const prev = segments[segments.length - 1];
    if (prev && sameSpan(prev, classes, style)) {
      prev.text += text;
    } else {
      segments.push(style ? { text, classes, style } : { text, classes });
    }
  };

  ESC_SEQ.lastIndex = 0;
  while ((m = ESC_SEQ.exec(line)) !== null) {
    push(line.slice(last, m.index));
    last = ESC_SEQ.lastIndex;
    // m[2] is the CSI final letter; m[1] its params. Undefined ⇒ this was an
    // OSC match, which we just strip.
    if (m[2] === 'm') {
      const params = m[1] === '' ? [] : m[1].split(';').map((p) => (p === '' ? 0 : Number(p)));
      applySgr(state, params);
    }
  }
  push(line.slice(last));
  return segments;
}

/** True when the string contains at least one escape sequence. */
export function hasAnsi(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1B[[\]]/.test(s);
}

// Screen-clear sequences a program emits to wipe the terminal: CSI 2J (erase
// display), CSI 3J (erase scrollback), and RIS (ESC c, full reset). `clear`,
// `reset`, and `printf '\033[2J\033[H'` all produce one of these.
// eslint-disable-next-line no-control-regex
const CLEAR_RE = /\x1B\[[23]J|\x1Bc/g;

/**
 * If a line contains a screen-clear sequence, report it and return only the
 * text that follows the *last* clear — i.e. what survives the wipe. Lets the
 * console honour `clear` / a repainting command (top-style) instead of
 * accumulating forever.
 */
export function takeAfterClear(text: string): { cleared: boolean; rest: string } {
  CLEAR_RE.lastIndex = 0;
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = CLEAR_RE.exec(text)) !== null) idx = m.index + m[0].length;
  return idx === -1 ? { cleared: false, rest: text } : { cleared: true, rest: text.slice(idx) };
}
