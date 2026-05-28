import { describe, expect, it } from 'vitest';
import { META_CTRL, META_SHIFT, resolveTextEditKey } from './keyMap';

const ev = (
  key: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

// Keycodes (kept inline here so the test doc spells out the wire
// values; if these change the test should change in lock-step).
const DPAD_LEFT = 21;
const DPAD_RIGHT = 22;
const DPAD_UP = 19;
const DPAD_DOWN = 20;
const MOVE_HOME = 122;
const MOVE_END = 123;

describe('resolveTextEditKey: returns null for inputs the mirror handles elsewhere', () => {
  it('null for unmodified arrows (plain arrow → existing specialMap)', () => {
    expect(resolveTextEditKey(ev('ArrowLeft'))).toBeNull();
    expect(resolveTextEditKey(ev('ArrowRight'))).toBeNull();
    expect(resolveTextEditKey(ev('ArrowUp'))).toBeNull();
    expect(resolveTextEditKey(ev('ArrowDown'))).toBeNull();
  });

  it('null for non-arrow keys', () => {
    expect(resolveTextEditKey(ev('a', { shiftKey: true }))).toBeNull();
    expect(resolveTextEditKey(ev('Backspace', { metaKey: true }))).toBeNull();
    expect(resolveTextEditKey(ev('Tab', { shiftKey: true }))).toBeNull();
  });
});

describe('resolveTextEditKey: ⇧+arrow → DPAD with META_SHIFT', () => {
  it('Shift+Left selects previous character', () => {
    expect(resolveTextEditKey(ev('ArrowLeft', { shiftKey: true }))).toEqual({
      keyCode: DPAD_LEFT,
      metaState: META_SHIFT,
    });
  });

  it('Shift+Right selects next character', () => {
    expect(resolveTextEditKey(ev('ArrowRight', { shiftKey: true }))).toEqual({
      keyCode: DPAD_RIGHT,
      metaState: META_SHIFT,
    });
  });

  it('Shift+Up selects up one line', () => {
    expect(resolveTextEditKey(ev('ArrowUp', { shiftKey: true }))).toEqual({
      keyCode: DPAD_UP,
      metaState: META_SHIFT,
    });
  });

  it('Shift+Down selects down one line', () => {
    expect(resolveTextEditKey(ev('ArrowDown', { shiftKey: true }))).toEqual({
      keyCode: DPAD_DOWN,
      metaState: META_SHIFT,
    });
  });
});

describe('resolveTextEditKey: ⌘+arrow → line / doc edges', () => {
  it('Cmd+Left → start of line (MOVE_HOME, no meta)', () => {
    expect(resolveTextEditKey(ev('ArrowLeft', { metaKey: true }))).toEqual({
      keyCode: MOVE_HOME,
      metaState: 0,
    });
  });

  it('Cmd+Right → end of line (MOVE_END, no meta)', () => {
    expect(resolveTextEditKey(ev('ArrowRight', { metaKey: true }))).toEqual({
      keyCode: MOVE_END,
      metaState: 0,
    });
  });

  it('Cmd+Up → start of doc (MOVE_HOME + META_CTRL)', () => {
    expect(resolveTextEditKey(ev('ArrowUp', { metaKey: true }))).toEqual({
      keyCode: MOVE_HOME,
      metaState: META_CTRL,
    });
  });

  it('Cmd+Down → end of doc (MOVE_END + META_CTRL)', () => {
    expect(resolveTextEditKey(ev('ArrowDown', { metaKey: true }))).toEqual({
      keyCode: MOVE_END,
      metaState: META_CTRL,
    });
  });
});

describe('resolveTextEditKey: ⌘+⇧+arrow → selection to line / doc edges', () => {
  it('Cmd+Shift+Left → select to start of line', () => {
    expect(resolveTextEditKey(ev('ArrowLeft', { metaKey: true, shiftKey: true }))).toEqual({
      keyCode: MOVE_HOME,
      metaState: META_SHIFT,
    });
  });

  it('Cmd+Shift+Right → select to end of line', () => {
    expect(resolveTextEditKey(ev('ArrowRight', { metaKey: true, shiftKey: true }))).toEqual({
      keyCode: MOVE_END,
      metaState: META_SHIFT,
    });
  });

  it('Cmd+Shift+Up → select to start of doc', () => {
    expect(resolveTextEditKey(ev('ArrowUp', { metaKey: true, shiftKey: true }))).toEqual({
      keyCode: MOVE_HOME,
      metaState: META_CTRL | META_SHIFT,
    });
  });

  it('Cmd+Shift+Down → select to end of doc', () => {
    expect(resolveTextEditKey(ev('ArrowDown', { metaKey: true, shiftKey: true }))).toEqual({
      keyCode: MOVE_END,
      metaState: META_CTRL | META_SHIFT,
    });
  });
});

describe('resolveTextEditKey: ⌥+arrow → word navigation', () => {
  it('Alt+Left → word back (DPAD_LEFT + META_CTRL)', () => {
    expect(resolveTextEditKey(ev('ArrowLeft', { altKey: true }))).toEqual({
      keyCode: DPAD_LEFT,
      metaState: META_CTRL,
    });
  });

  it('Alt+Right → word forward (DPAD_RIGHT + META_CTRL)', () => {
    expect(resolveTextEditKey(ev('ArrowRight', { altKey: true }))).toEqual({
      keyCode: DPAD_RIGHT,
      metaState: META_CTRL,
    });
  });

  it('Alt+Shift+Left → select word back', () => {
    expect(resolveTextEditKey(ev('ArrowLeft', { altKey: true, shiftKey: true }))).toEqual({
      keyCode: DPAD_LEFT,
      metaState: META_CTRL | META_SHIFT,
    });
  });

  it('Alt+Shift+Right → select word forward', () => {
    expect(resolveTextEditKey(ev('ArrowRight', { altKey: true, shiftKey: true }))).toEqual({
      keyCode: DPAD_RIGHT,
      metaState: META_CTRL | META_SHIFT,
    });
  });
});

describe('resolveTextEditKey: Ctrl is a Cmd-equivalent on non-Mac hosts', () => {
  it('Ctrl+Left maps like Cmd+Left', () => {
    expect(resolveTextEditKey(ev('ArrowLeft', { ctrlKey: true }))).toEqual({
      keyCode: MOVE_HOME,
      metaState: 0,
    });
  });

  it('Ctrl+Shift+Right maps like Cmd+Shift+Right', () => {
    expect(resolveTextEditKey(ev('ArrowRight', { ctrlKey: true, shiftKey: true }))).toEqual({
      keyCode: MOVE_END,
      metaState: META_SHIFT,
    });
  });
});

describe('META_SHIFT / META_CTRL bit layout', () => {
  // Android's `BaseKeyListener` inspects both the generic and the
  // left/right-specific bits, so the exported constants must combine
  // them. Locking the numeric values pins the contract.
  it('META_SHIFT is META_SHIFT_ON | META_SHIFT_LEFT_ON', () => {
    expect(META_SHIFT).toBe(0x0001 | 0x0040);
  });

  it('META_CTRL is META_CTRL_ON | META_CTRL_LEFT_ON', () => {
    expect(META_CTRL).toBe(0x1000 | 0x2000);
  });
});
