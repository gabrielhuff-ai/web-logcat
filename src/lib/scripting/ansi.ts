// Scripting console — ANSI SGR ("colour") parsing.
//
// Turns a line that may contain ANSI escape sequences into styled segments
// the console renders as <span>s. We handle the common SGR codes (the 8 + 8
// bright foreground/background colours and bold/dim/italic/underline) and
// silently strip every other escape (cursor moves, OSC, etc.) so a stray
// sequence shows as nothing rather than as garbage bytes.
//
// Parsing is per-line and stateless across calls: a colour set on one line
// does not bleed into the next. That matches the line-based console renderer
// and the overwhelmingly common `echo -e "\e[31m…\e[0m"` usage, which resets
// within the line. Non-ASCII (emoji, CJK) passes straight through — we only
// ever cut the string around escape sequences, never inside a character.

export interface AnsiSegment {
  text: string;
  /** CSS class names to apply to this segment's span (empty ⇒ plain text). */
  classes: string[];
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

interface SgrState {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

function emptyState(): SgrState {
  return { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
}

function classesFor(s: SgrState): string[] {
  const out: string[] = [];
  if (s.fg) out.push(`sc-ansi-fg-${s.fg}`);
  if (s.bg) out.push(`sc-ansi-bg-${s.bg}`);
  if (s.bold) out.push('sc-ansi-bold');
  if (s.dim) out.push('sc-ansi-dim');
  if (s.italic) out.push('sc-ansi-italic');
  if (s.underline) out.push('sc-ansi-underline');
  return out;
}

/** Apply one parsed SGR sequence (its numeric params) to the running state. */
function applySgr(state: SgrState, params: number[]): void {
  // An empty `\e[m` is the same as `\e[0m` (reset).
  const codes = params.length === 0 ? [0] : params;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) {
      Object.assign(state, emptyState());
    } else if (c === 1) state.bold = true;
    else if (c === 2) state.dim = true;
    else if (c === 3) state.italic = true;
    else if (c === 4) state.underline = true;
    else if (c === 22) {
      state.bold = false;
      state.dim = false;
    } else if (c === 23) state.italic = false;
    else if (c === 24) state.underline = false;
    else if (c >= 30 && c <= 37) state.fg = FG_NAMES[c];
    else if (c >= 40 && c <= 47) state.bg = FG_NAMES[c - 10];
    else if (c >= 90 && c <= 97) state.fg = `bright-${FG_NAMES[c - 60]}`;
    else if (c >= 100 && c <= 107) state.bg = `bright-${FG_NAMES[c - 70]}`;
    else if (c === 39) state.fg = null;
    else if (c === 49) state.bg = null;
    else if (c === 38 || c === 48) {
      // Extended colour. Consume its operands so they don't get mistaken for
      // further SGR codes; map only the 16-colour palette (38;5;0-15), which
      // we can render, and ignore 256/truecolour for now.
      const target: 'fg' | 'bg' = c === 38 ? 'fg' : 'bg';
      const mode = codes[i + 1];
      if (mode === 5) {
        const idx = codes[i + 2];
        i += 2;
        if (idx >= 0 && idx <= 7) state[target] = FG_NAMES[idx + 30];
        else if (idx >= 8 && idx <= 15) state[target] = `bright-${FG_NAMES[idx + 22]}`;
        else state[target] = null;
      } else if (mode === 2) {
        i += 4; // r;g;b — skip, no class for truecolour
        state[target] = null;
      }
    }
  }
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
    const classes = classesFor(state);
    const prev = segments[segments.length - 1];
    if (prev && prev.classes.length === classes.length && prev.classes.every((c, i) => c === classes[i])) {
      prev.text += text;
    } else {
      segments.push({ text, classes });
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
