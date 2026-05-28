import { describe, expect, it } from 'vitest';
import {
  ACTION_DOWN,
  ACTION_UP,
  META_ALT,
  META_CTRL,
  META_SHIFT,
  planComboKey,
  resolveTextEditKey,
} from './keyMap';

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

// Modifier keycodes — kept inline so a wire-value change here surfaces
// in the test alongside the resolver change.
const KC_SHIFT_LEFT = 59;
const KC_ALT_LEFT = 57;
const KC_CTRL_LEFT = 113;
const KC_A = 29;
const KC_C = 31;
const KC_MOVE_END = 123;

describe('planComboKey: no modifiers', () => {
  it('emits a bare DOWN+UP when no modifier bits are set', () => {
    expect(planComboKey(KC_A, 0)).toEqual([
      { action: ACTION_DOWN, keyCode: KC_A, metaState: 0 },
      { action: ACTION_UP, keyCode: KC_A, metaState: 0 },
    ]);
  });
});

describe('planComboKey: Ctrl combo', () => {
  it('Ctrl+C presses Ctrl, taps C, releases Ctrl — with metaState rising and falling', () => {
    // This is the exact wire sequence the device needs to fire
    // TextView.onKeyShortcut(ACTION_COPY).
    expect(planComboKey(KC_C, META_CTRL)).toEqual([
      { action: ACTION_DOWN, keyCode: KC_CTRL_LEFT, metaState: META_CTRL },
      { action: ACTION_DOWN, keyCode: KC_C, metaState: META_CTRL },
      { action: ACTION_UP, keyCode: KC_C, metaState: META_CTRL },
      { action: ACTION_UP, keyCode: KC_CTRL_LEFT, metaState: 0 },
    ]);
  });
});

describe('planComboKey: Shift combo', () => {
  it('Shift+End emits Shift DOWN + End DOWN/UP + Shift UP', () => {
    // Sequence the previous metaState-only path never produced —
    // the device-side selection-extension only fires when the
    // modifier keycode is actually held.
    expect(planComboKey(KC_MOVE_END, META_SHIFT)).toEqual([
      { action: ACTION_DOWN, keyCode: KC_SHIFT_LEFT, metaState: META_SHIFT },
      { action: ACTION_DOWN, keyCode: KC_MOVE_END, metaState: META_SHIFT },
      { action: ACTION_UP, keyCode: KC_MOVE_END, metaState: META_SHIFT },
      { action: ACTION_UP, keyCode: KC_SHIFT_LEFT, metaState: 0 },
    ]);
  });
});

describe('planComboKey: multi-modifier combos', () => {
  it('Ctrl+Shift+End presses Ctrl, then Shift, then End, then releases in reverse', () => {
    // Reverse-order release is what real hardware emits and what
    // Android's InputDispatcher expects so the state machine stays
    // consistent through the combo.
    const plan = planComboKey(KC_MOVE_END, META_CTRL | META_SHIFT);
    expect(plan).toHaveLength(6);
    expect(plan[0]).toEqual({ action: ACTION_DOWN, keyCode: KC_CTRL_LEFT, metaState: META_CTRL });
    expect(plan[1]).toEqual({
      action: ACTION_DOWN,
      keyCode: KC_SHIFT_LEFT,
      metaState: META_CTRL | META_SHIFT,
    });
    expect(plan[2]).toEqual({
      action: ACTION_DOWN,
      keyCode: KC_MOVE_END,
      metaState: META_CTRL | META_SHIFT,
    });
    expect(plan[3]).toEqual({
      action: ACTION_UP,
      keyCode: KC_MOVE_END,
      metaState: META_CTRL | META_SHIFT,
    });
    expect(plan[4]).toEqual({
      action: ACTION_UP,
      keyCode: KC_SHIFT_LEFT,
      metaState: META_CTRL,
    });
    expect(plan[5]).toEqual({ action: ACTION_UP, keyCode: KC_CTRL_LEFT, metaState: 0 });
  });

  it('Alt+Shift+Right (select word forward) is in canonical order', () => {
    const plan = planComboKey(22 /* DPAD_RIGHT */, META_CTRL | META_SHIFT);
    // Order: Ctrl press, Shift press, main, main release, Shift release, Ctrl release.
    expect(plan.map((p) => p.keyCode)).toEqual([
      KC_CTRL_LEFT,
      KC_SHIFT_LEFT,
      22,
      22,
      KC_SHIFT_LEFT,
      KC_CTRL_LEFT,
    ]);
  });
});

describe('planComboKey: accepts either generic or side-specific meta bits', () => {
  it('META_CTRL_ON alone (0x1000) still produces the Ctrl press', () => {
    const plan = planComboKey(KC_C, 0x1000);
    expect(plan[0].keyCode).toBe(KC_CTRL_LEFT);
  });

  it('META_CTRL_LEFT_ON alone (0x2000) still produces the Ctrl press', () => {
    const plan = planComboKey(KC_C, 0x2000);
    expect(plan[0].keyCode).toBe(KC_CTRL_LEFT);
  });
});

describe('planComboKey: Alt-only combo', () => {
  it('Alt+Left presses Alt, taps DPAD_LEFT, releases Alt', () => {
    expect(planComboKey(21 /* DPAD_LEFT */, META_ALT)).toEqual([
      { action: ACTION_DOWN, keyCode: KC_ALT_LEFT, metaState: META_ALT },
      { action: ACTION_DOWN, keyCode: 21, metaState: META_ALT },
      { action: ACTION_UP, keyCode: 21, metaState: META_ALT },
      { action: ACTION_UP, keyCode: KC_ALT_LEFT, metaState: 0 },
    ]);
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
