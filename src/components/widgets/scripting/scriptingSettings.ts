// Scripting widget — persisted per-tile configuration.
//
// One Scripting widget owns a single shell script plus an ordered list of
// controls. Inputs carry a value (exported as an env var when a function
// runs); actions/displays are bound to a shell function. Sections are
// visual-only grouping. Runtime state (current input values, console runs,
// poll handles) is NOT persisted — only the authored configuration is.

export type ControlValue = string | number | boolean;

/** Input controls that carry a value, exported as `$LABEL` on every run. */
export type InputKind = 'text' | 'slider' | 'toggle' | 'select' | 'stepper' | 'knob';

/** Bound displays that render the output of a shell function. */
export type BoundDisplayKind = 'readout' | 'status' | 'gauge' | 'led';

export interface BaseControl {
  /** Stable id, independent of the label (labels can change). */
  id: string;
  label: string;
  description?: string;
}

export interface InputControl extends BaseControl {
  kind: InputKind;
  /** Render the description under the control instead of only on hover. */
  descInline?: boolean;
  defaultValue: ControlValue;
  /** slider / stepper / knob. */
  min?: number;
  max?: number;
  step?: number;
  /** Suffix shown next to the value. */
  unit?: string;
  /** select only. */
  options?: string[];
  /** toggle only — `[offValue, onValue]` exported to the env. Absent ⇒ '0' / '1'. */
  values?: string[];
  /**
   * What happens when the value changes:
   *   - 'refresh' — re-run displays bound to functions that read this var.
   *   - 'run'     — run this control's own function (derived from the label),
   *                 routing output to `bindOutputTo`.
   *   - 'none'    — nothing (value is read on the next explicit run).
   */
  onChange: 'refresh' | 'run' | 'none';
  /** For onChange: 'run' — output sink (a console id, or 'console'). */
  bindOutputTo?: string;
}

export interface ButtonControl extends BaseControl {
  kind: 'button';
  variant: 'default' | 'subtle' | 'destructive';
  /** Open a confirmation popover before running. */
  confirm: boolean;
  /** Display id whose output this button feeds, or 'console'. */
  bindOutputTo: string;
}

export interface ConsoleControl extends BaseControl {
  kind: 'console';
  scope: 'recent' | 'scrollback';
  copyButton: boolean;
  autoScroll: boolean;
}

export interface BoundDisplayControl extends BaseControl {
  kind: BoundDisplayKind;
  /** Function whose stdout fills this display. */
  boundTo: string;
  unit?: string;
  /** gauge — arc range. */
  min?: number;
  max?: number;
  autoPoll: { enabled: boolean; intervalSec: number };
  /** Re-run when any input the bound function reads changes. */
  refreshOnChange: boolean;
}

export interface SectionControl {
  id: string;
  kind: 'section';
  title: string;
  description?: string;
}

export type ControlConfig =
  | InputControl
  | ButtonControl
  | ConsoleControl
  | BoundDisplayControl
  | SectionControl;

export type ControlKind = ControlConfig['kind'];

export interface ScriptingSettings {
  /** The shell script body — function definitions the controls call. */
  script: string;
  /** Open the shell channel through `su` (per panel). */
  runAsRoot: boolean;
  /** Ordered controls, including section headings. */
  controls: ControlConfig[];
  /** Body font size in px. */
  fontSize: number;
}

const STARTER_SCRIPT = `#!/system/bin/sh
# Each Scripting widget owns one shell script. Input controls export their
# value as env vars (e.g. a "Package" input → $PACKAGE). Action buttons and
# bound displays call the functions you define below.
#
# Example — add a text input labelled "Package" and a button labelled
# "Force stop", then:
#
# force_stop() {
#   am force-stop "$PACKAGE"
# }
`;

export const SCRIPTING_DEFAULTS: ScriptingSettings = {
  script: STARTER_SCRIPT,
  runAsRoot: false,
  controls: [],
  fontSize: 12,
};

/**
 * A ready-made demo panel loaded from the empty-state "example" link. It
 * exercises every control kind. The shell functions are echo-based stubs so
 * the panel produces visible output on the simulator (no device) — on a real
 * device you'd swap in `am` / `pm` / `dumpsys` / `settings` commands.
 */
export const EXAMPLE_PANEL: ScriptingSettings = {
  script: [
    '#!/system/bin/sh',
    '# Demo toolbox. Inputs export $VARS; buttons and displays call the',
    '# functions below. These are echo stubs so they show output on the',
    '# simulator — replace them with real am/pm/dumpsys/settings on a device.',
    '',
    'info() {',
    '  echo "Package: $PACKAGE"',
    '  echo "User: $USER   Verbose: $VERBOSE"',
    '}',
    'force_stop() { echo "force-stopped $PACKAGE (user $USER)"; }',
    'clear_data() { echo "cleared data for $PACKAGE"; }',
    '',
    'brightness() { echo "brightness -> $BRIGHTNESS"; }',
    '',
    '# Bound to the live displays below.',
    'battery_temp() { echo 31.2; }',
    'cpu()          { echo 38; }',
    'network()      { echo online; }',
    'charging()     { echo green; }',
  ].join('\n'),
  runAsRoot: false,
  fontSize: 12,
  controls: [
    { id: 'ex_s1', kind: 'section', title: 'Target', description: 'What the actions below operate on.' },
    {
      id: 'ex_pkg',
      kind: 'text',
      label: 'Package',
      description: 'The target package name.',
      defaultValue: 'com.android.settings',
      onChange: 'none',
    },
    {
      id: 'ex_user',
      kind: 'select',
      label: 'User',
      options: ['0', '10'],
      defaultValue: '0',
      onChange: 'none',
    },
    { id: 'ex_verbose', kind: 'toggle', label: 'Verbose', defaultValue: false, onChange: 'none' },

    { id: 'ex_s2', kind: 'section', title: 'Tweaks' },
    {
      id: 'ex_bright',
      kind: 'slider',
      label: 'Brightness',
      description: 'Runs brightness() on change.',
      descInline: true,
      defaultValue: 180,
      min: 0,
      max: 255,
      step: 5,
      onChange: 'run',
      bindOutputTo: 'console',
    },
    { id: 'ex_vol', kind: 'knob', label: 'Volume', defaultValue: 60, min: 0, max: 100, step: 1, unit: '%', onChange: 'none' },
    {
      id: 'ex_anim',
      kind: 'stepper',
      label: 'Anim scale',
      defaultValue: 1,
      min: 0,
      max: 5,
      step: 0.5,
      unit: 'x',
      onChange: 'none',
    },

    { id: 'ex_s3', kind: 'section', title: 'Actions' },
    { id: 'ex_info', kind: 'button', label: 'Info', variant: 'default', confirm: false, bindOutputTo: 'console' },
    { id: 'ex_stop', kind: 'button', label: 'Force stop', variant: 'default', confirm: false, bindOutputTo: 'console' },
    {
      id: 'ex_clear',
      kind: 'button',
      label: 'Clear data',
      variant: 'destructive',
      confirm: true,
      bindOutputTo: 'console',
    },

    { id: 'ex_s4', kind: 'section', title: 'Live', description: 'Polled every few seconds.' },
    {
      id: 'ex_batt',
      kind: 'readout',
      label: 'Battery temp',
      boundTo: 'battery_temp',
      unit: '°C',
      autoPoll: { enabled: true, intervalSec: 3 },
      refreshOnChange: false,
    },
    {
      id: 'ex_cpu',
      kind: 'gauge',
      label: 'CPU',
      boundTo: 'cpu',
      unit: '%',
      min: 0,
      max: 100,
      autoPoll: { enabled: true, intervalSec: 3 },
      refreshOnChange: false,
    },
    {
      id: 'ex_net',
      kind: 'status',
      label: 'Network',
      boundTo: 'network',
      autoPoll: { enabled: true, intervalSec: 5 },
      refreshOnChange: false,
    },
    {
      id: 'ex_charge',
      kind: 'led',
      label: 'Charging',
      boundTo: 'charging',
      autoPoll: { enabled: true, intervalSec: 5 },
      refreshOnChange: false,
    },

    { id: 'ex_con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
  ],
};
