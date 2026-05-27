// Scripting widget — builder helpers: new-control factory, the add-menu
// catalog, and the derived-name shown next to each list row. Pure (no JSX).

import { fnFromLabel, varFromLabel } from '../../../lib/scripting/derive';
import type { ControlConfig, ControlKind } from './scriptingSettings';

let counter = 0;

/** Stable unique id for a freshly added control. */
export function newControlId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `c_${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {
    /* fall through */
  }
  counter += 1;
  return `c_${Date.now().toString(36)}_${counter}`;
}

/** A new control of `kind` with sensible defaults, ready to append + select. */
export function makeControl(kind: ControlKind): ControlConfig {
  const id = newControlId();
  switch (kind) {
    case 'text':
      return { id, kind, label: 'Text', defaultValue: '', onChange: 'none' };
    case 'slider':
      return { id, kind, label: 'Slider', defaultValue: 50, min: 0, max: 100, step: 1, onChange: 'refresh' };
    case 'toggle':
      return { id, kind, label: 'Toggle', defaultValue: false, onChange: 'refresh' };
    case 'select':
      return { id, kind, label: 'Select', defaultValue: 'one', options: ['one', 'two'], onChange: 'refresh' };
    case 'stepper':
      return { id, kind, label: 'Stepper', defaultValue: 0, min: 0, max: 10, step: 1, onChange: 'refresh' };
    case 'knob':
      return { id, kind, label: 'Knob', defaultValue: 50, min: 0, max: 100, step: 1, unit: '%', onChange: 'refresh' };
    case 'button':
      return { id, kind, label: 'Action', variant: 'default', confirm: false, bindOutputTo: 'console' };
    case 'daemon':
      return { id, kind, label: 'Daemon', bindOutputTo: 'console', showControls: false, autoStart: true, restart: 'no' };
    case 'console':
      return { id, kind, label: 'Console', scope: 'recent', copyButton: true, autoScroll: true };
    case 'readout':
      return { id, kind, label: 'Readout', boundTo: '', autoPoll: { enabled: false, intervalSec: 2 }, refreshOnChange: false };
    case 'status':
      return { id, kind, label: 'Status', boundTo: '', autoPoll: { enabled: false, intervalSec: 5 }, refreshOnChange: false };
    case 'gauge':
      return { id, kind, label: 'Gauge', boundTo: '', min: 0, max: 100, autoPoll: { enabled: false, intervalSec: 2 }, refreshOnChange: false };
    case 'led':
      return { id, kind, label: 'LED', boundTo: '', autoPoll: { enabled: false, intervalSec: 5 }, refreshOnChange: false };
    case 'section':
      return { id, kind, title: 'Section' };
  }
}

export interface PickerEntry {
  kind: ControlKind;
  label: string;
  group: 'Inputs' | 'Displays' | 'Layout';
}

export const PICKER: readonly PickerEntry[] = [
  { kind: 'button', label: 'Action button', group: 'Inputs' },
  { kind: 'daemon', label: 'Daemon', group: 'Inputs' },
  { kind: 'console', label: 'Console', group: 'Displays' },
  { kind: 'gauge', label: 'Gauge', group: 'Displays' },
  { kind: 'knob', label: 'Knob', group: 'Inputs' },
  { kind: 'led', label: 'LED', group: 'Displays' },
  { kind: 'readout', label: 'Readout', group: 'Displays' },
  { kind: 'section', label: 'Section', group: 'Layout' },
  { kind: 'select', label: 'Select', group: 'Inputs' },
  { kind: 'slider', label: 'Slider', group: 'Inputs' },
  { kind: 'status', label: 'Status pill', group: 'Displays' },
  { kind: 'stepper', label: 'Stepper', group: 'Inputs' },
  { kind: 'text', label: 'Text field', group: 'Inputs' },
  { kind: 'toggle', label: 'Toggle', group: 'Inputs' },
];

/** The shell name (env var or function) a control row shows next to its label. */
export function derivedName(c: ControlConfig): string {
  switch (c.kind) {
    case 'section':
      return '— heading —';
    case 'console':
      return 'bound: last run';
    case 'button':
      return `${fnFromLabel(c.label)}()`;
    case 'daemon':
      return `${fnFromLabel(c.label)}() · daemon`;
    case 'readout':
    case 'status':
    case 'gauge':
    case 'led':
      return c.boundTo ? `${c.boundTo}()` : '(unbound)';
    default:
      return varFromLabel(c.label);
  }
}
