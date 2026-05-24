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
  /** Whether changing the value eagerly refreshes displays that read it. */
  onChange: 'refresh' | 'none';
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
