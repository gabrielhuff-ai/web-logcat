// Scripting widget — turn the current input-control values into the env map
// passed to a run. Names derive deterministically from labels; booleans map to
// 1/0, numbers stringify, strings pass through. Pure + unit tested.

import { varNameFromLabel } from '../../../lib/scripting/derive';
import type { ControlConfig, ControlValue, InputControl } from './scriptingSettings';

/** Narrows a control to the value-carrying input kinds. */
export function isInputControl(c: ControlConfig): c is InputControl {
  return (
    c.kind === 'text' ||
    c.kind === 'slider' ||
    c.kind === 'toggle' ||
    c.kind === 'select' ||
    c.kind === 'stepper' ||
    c.kind === 'knob'
  );
}

export function stringifyValue(v: ControlValue | undefined): string {
  if (v === true) return '1';
  if (v === false) return '0';
  if (v == null) return '';
  return String(v);
}

/**
 * Build `{ NAME: value }` for every input control, keyed by the derived env
 * var name. The runner passes these as `env NAME=value` argv tokens, so values
 * are never concatenated into the command string.
 */
export function envFromControls(
  controls: ControlConfig[],
  values: Record<string, ControlValue>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const c of controls) {
    if (!isInputControl(c)) continue;
    const v = c.id in values ? values[c.id] : c.defaultValue;
    env[varNameFromLabel(c.label)] = stringifyValue(v);
  }
  return env;
}
