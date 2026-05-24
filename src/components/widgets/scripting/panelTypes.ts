// Scripting widget — runtime view types shared by the widget and its panel.
// Kept out of the component files so a plain const export (EMPTY_CONSOLE)
// doesn't trip react-refresh's only-export-components rule.

import type { ConsoleLine, CtrlState, DisplayState, LedColor } from './controls';

/** Per-display runtime value, produced by a run (M5 wires the producers). */
export interface DisplayValue {
  text: string;
  number: number;
  state: DisplayState;
  ledColor: LedColor;
  ledState: string;
  stale: boolean;
}

export interface ConsoleView {
  lines: ConsoleLine[];
  state: CtrlState;
  exit: number;
  empty: boolean;
  copied: boolean;
}

export const EMPTY_CONSOLE: ConsoleView = {
  lines: [],
  state: 'idle',
  exit: 0,
  empty: true,
  copied: false,
};
