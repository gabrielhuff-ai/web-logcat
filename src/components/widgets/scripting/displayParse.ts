// Scripting widget — turn a run result into a display value.
//
// Readouts/gauges pull the first number from the last non-empty stdout line;
// status shows that line; LEDs map the line to a colour. A non-zero exit puts
// the display into the error state. Pure + unit tested.

import type { RunResult } from '../../../lib/scripting/runner';
import type { LedColor } from './controls';
import type { BoundDisplayControl, ControlConfig } from './scriptingSettings';
import type { DisplayValue } from './panelTypes';

export function isBoundDisplay(c: ControlConfig): c is BoundDisplayControl {
  return c.kind === 'readout' || c.kind === 'status' || c.kind === 'gauge' || c.kind === 'led';
}

const LED_WORDS: ReadonlySet<string> = new Set(['green', 'amber', 'red', 'blue', 'off']);

function lastLine(s: string): string {
  const lines = s.split('\n').filter((l) => l.trim() !== '');
  return (lines[lines.length - 1] ?? '').trim();
}

export function parseDisplayValue(kind: BoundDisplayControl['kind'], r: RunResult): DisplayValue {
  const errored = r.exitCode !== 0;
  const out = lastLine(r.stdout);
  const numMatch = out.match(/-?\d+(?:\.\d+)?/);
  const number = numMatch ? Number(numMatch[0]) : 0;

  let ledColor: LedColor = 'off';
  let ledState = 'off';
  if (kind === 'led') {
    const v = out.toLowerCase();
    if (LED_WORDS.has(v)) {
      ledColor = v as LedColor;
      ledState = v;
    } else if (errored) {
      ledColor = 'red';
      ledState = 'error';
    } else if (v === '' || v === '0' || v === 'false') {
      ledColor = 'off';
      ledState = 'off';
    } else {
      ledColor = 'green';
      ledState = 'on';
    }
  }

  const errText = lastLine(r.stderr) || 'error';
  return {
    text: errored ? errText : out || '—',
    number: Number.isFinite(number) ? number : 0,
    state: errored ? 'err' : 'ok',
    ledColor,
    ledState,
    stale: false,
  };
}
