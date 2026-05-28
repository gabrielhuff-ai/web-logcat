// Mac-standard text-editing shortcut → Android keycode mapping for
// the Mirror widget. The host browser emits a `KeyboardEvent`; we
// resolve it to the Android `KeyEvent` keycode + metaState that scrcpy
// expects, so common Mac muscle-memory (Cmd+Left → start of line,
// Cmd+Shift+Down → select to end of doc, etc.) does the right thing
// inside the foreground app on the device. Plain arrows and other
// non-modifier keys are *not* resolved here — `MirrorWidget.tsx`'s
// existing `specialMap` still handles those so this helper stays
// scoped to the modifier combinations.
//
// macOS↔Android mapping (each line a separate test case):
//
//   ⇧+Arrow             → DPAD_*  + META_SHIFT         (select char / line)
//   ⌘+ArrowLeft         → MOVE_HOME                    (start of line)
//   ⌘+ArrowRight        → MOVE_END                     (end of line)
//   ⌘+ArrowUp           → MOVE_HOME + META_CTRL        (start of doc — Android reads
//                                                       Ctrl+Home as document home)
//   ⌘+ArrowDown         → MOVE_END  + META_CTRL        (end of doc)
//   ⌘+⇧+ArrowLeft       → MOVE_HOME + META_SHIFT       (select to start of line)
//   ⌘+⇧+ArrowRight      → MOVE_END  + META_SHIFT       (select to end of line)
//   ⌘+⇧+ArrowUp         → MOVE_HOME + META_CTRL+SHIFT  (select to start of doc)
//   ⌘+⇧+ArrowDown       → MOVE_END  + META_CTRL+SHIFT  (select to end of doc)
//   ⌥+ArrowLeft         → DPAD_LEFT  + META_CTRL       (word back — Android reads
//                                                       Ctrl+arrow as word nav)
//   ⌥+ArrowRight        → DPAD_RIGHT + META_CTRL       (word forward)
//   ⌥+⇧+ArrowLeft       → DPAD_LEFT  + META_CTRL+SHIFT (select word back)
//   ⌥+⇧+ArrowRight      → DPAD_RIGHT + META_CTRL+SHIFT (select word forward)
//
// On non-Mac hosts the same modifier names line up (Ctrl ≈ Cmd for
// the metaKey-vs-ctrlKey caller; Alt ≈ Option), so the resolver
// accepts whichever the caller passes for the Cmd role.

export type AndroidKeyCode = number;

const KEYCODE_DPAD_UP: AndroidKeyCode = 19;
const KEYCODE_DPAD_DOWN: AndroidKeyCode = 20;
const KEYCODE_DPAD_LEFT: AndroidKeyCode = 21;
const KEYCODE_DPAD_RIGHT: AndroidKeyCode = 22;
const KEYCODE_MOVE_HOME: AndroidKeyCode = 122;
const KEYCODE_MOVE_END: AndroidKeyCode = 123;

const META_SHIFT_ON = 0x0001;
const META_SHIFT_LEFT_ON = 0x0040;
const META_CTRL_ON = 0x1000;
const META_CTRL_LEFT_ON = 0x2000;

/** `META_SHIFT_ON | META_SHIFT_LEFT_ON` — Android's `BaseKeyListener`
 *  inspects both the generic and the left-specific bits. */
export const META_SHIFT = META_SHIFT_ON | META_SHIFT_LEFT_ON;
/** `META_CTRL_ON | META_CTRL_LEFT_ON` — same reasoning as `META_SHIFT`. */
export const META_CTRL = META_CTRL_ON | META_CTRL_LEFT_ON;

export interface KeyboardEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface ResolvedKey {
  keyCode: AndroidKeyCode;
  metaState: number;
}

/**
 * Resolve a host `KeyboardEvent` to an Android keycode + metaState for
 * the Mac-standard text-editing shortcuts. Returns `null` when the
 * event isn't one we want to forward as an editor shortcut — the
 * caller's existing handler then takes over (plain arrows, printable
 * characters, etc.).
 *
 * Cmd is read off `metaKey || ctrlKey` so the same mapping works on
 * Linux/Windows when the user happens to press Ctrl+arrow. That's a
 * minor superset on those platforms — Ctrl+arrow normally moves by
 * word natively, but the mirror's keystrokes were never going to
 * reach the host editor anyway, and forwarding it as "line start"
 * still feels closer to the Mac user's expectation.
 */
export function resolveTextEditKey(e: KeyboardEventLike): ResolvedKey | null {
  const cmd = e.metaKey || e.ctrlKey;
  const alt = e.altKey;
  const shift = e.shiftKey;

  // No modifier → not our business; the caller's specialMap handles
  // plain Backspace/Enter/arrows.
  if (!cmd && !alt && !shift) return null;

  switch (e.key) {
    case 'ArrowLeft':
      return mapArrow(KEYCODE_DPAD_LEFT, KEYCODE_MOVE_HOME, { cmd, alt, shift });
    case 'ArrowRight':
      return mapArrow(KEYCODE_DPAD_RIGHT, KEYCODE_MOVE_END, { cmd, alt, shift });
    case 'ArrowUp':
      // Cmd+Up = start of doc (MOVE_HOME with Ctrl in Android).
      // Plain Shift+Up = select line up (DPAD_UP with Shift).
      if (cmd && !alt) {
        return { keyCode: KEYCODE_MOVE_HOME, metaState: META_CTRL | (shift ? META_SHIFT : 0) };
      }
      if (shift && !alt && !cmd) {
        return { keyCode: KEYCODE_DPAD_UP, metaState: META_SHIFT };
      }
      return null;
    case 'ArrowDown':
      if (cmd && !alt) {
        return { keyCode: KEYCODE_MOVE_END, metaState: META_CTRL | (shift ? META_SHIFT : 0) };
      }
      if (shift && !alt && !cmd) {
        return { keyCode: KEYCODE_DPAD_DOWN, metaState: META_SHIFT };
      }
      return null;
    default:
      return null;
  }
}

function mapArrow(
  dpad: AndroidKeyCode,
  moveLineEdge: AndroidKeyCode,
  mods: { cmd: boolean; alt: boolean; shift: boolean },
): ResolvedKey | null {
  const { cmd, alt, shift } = mods;
  // Cmd takes precedence over Alt — there's no Mac shortcut that uses
  // both for arrow navigation, and giving Cmd priority keeps the
  // line-edge action discoverable even if a stuck modifier slips in.
  if (cmd) {
    return { keyCode: moveLineEdge, metaState: shift ? META_SHIFT : 0 };
  }
  if (alt) {
    return { keyCode: dpad, metaState: META_CTRL | (shift ? META_SHIFT : 0) };
  }
  if (shift) {
    return { keyCode: dpad, metaState: META_SHIFT };
  }
  return null;
}
