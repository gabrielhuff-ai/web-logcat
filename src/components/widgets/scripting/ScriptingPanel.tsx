// Scripting widget — runtime panel renderer.
//
// Walks the ordered controls config and groups consecutive controls of the
// same category into the design's responsive bands (sections, input grid,
// button rail, displays grid, console). Presentational: value + run state are
// supplied by the widget; this component just lays them out.

import type { ReactNode } from 'react';
import {
  ScButton,
  ScConsole,
  ScGauge,
  ScKnob,
  ScLED,
  ScReadout,
  ScSection,
  ScSelect,
  ScSlider,
  ScStatus,
  ScStepper,
  ScText,
  ScToggle,
  type CtrlState,
} from './controls';
import { groupControls, type Group } from './panelLayout';
import { EMPTY_CONSOLE, type ConsoleView, type DisplayValue } from './panelTypes';
import type { ControlConfig, ControlValue } from './scriptingSettings';

export interface ScriptingPanelProps {
  controls: ControlConfig[];
  values: Record<string, ControlValue>;
  onInputChange: (id: string, v: ControlValue) => void;
  /** Per-button run lifecycle, keyed by control id. */
  buttonState: Record<string, CtrlState>;
  onRun: (id: string) => void;
  /** Per-display value, keyed by control id. */
  displayValues: Record<string, DisplayValue>;
  /** Per-console view, keyed by console control id. */
  consoleViews: Record<string, ConsoleView>;
  onCopyConsole: (id: string) => void;
  /** When the script fails `sh -n`, action buttons are disabled. */
  actionsDisabled?: boolean;
}

const toNum = (v: ControlValue | undefined, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toStr = (v: ControlValue | undefined, fallback = ''): string =>
  v == null ? fallback : String(v);
const toBool = (v: ControlValue | undefined): boolean => v === true || v === 'true' || v === 1;

export function ScriptingPanel(props: ScriptingPanelProps) {
  const { controls } = props;
  const groups = groupControls(controls);
  return (
    <>
      {groups.map((g, i) => (
        <GroupView key={i} group={g} props={props} />
      ))}
    </>
  );
}

function GroupView({ group, props }: { group: Group; props: ScriptingPanelProps }) {
  switch (group.category) {
    case 'section': {
      const s = group.items[0];
      if (s.kind !== 'section') return null;
      return <ScSection title={s.title} description={s.description} />;
    }
    case 'inputs':
      return <div className="sw-inputs">{group.items.map((c) => renderInput(c, props))}</div>;
    case 'buttons':
      return <div className="sw-buttons">{group.items.map((c) => renderButton(c, props))}</div>;
    case 'displays':
      return <div className="sw-readouts">{group.items.map((c) => renderDisplay(c, props))}</div>;
    case 'console':
      return (
        <div className="sw-displays" style={{ flex: 1, minHeight: 120 }}>
          {group.items.map((c) => renderConsole(c, props))}
        </div>
      );
  }
}

function renderInput(c: ControlConfig, props: ScriptingPanelProps): ReactNode {
  const { values, onInputChange } = props;
  const v = values[c.id];
  switch (c.kind) {
    case 'text':
      return (
        <ScText
          key={c.id}
          label={c.label}
          value={toStr(v)}
          multiline={c.multiline}
          description={c.description}
          descInline={c.descInline}
          onChange={(next) => onInputChange(c.id, next)}
        />
      );
    case 'slider':
      return (
        <ScSlider
          key={c.id}
          label={c.label}
          min={c.min ?? 0}
          max={c.max ?? 100}
          step={c.step ?? 1}
          value={toNum(v)}
          unit={c.unit}
          description={c.description}
          descInline={c.descInline}
          onChange={(next) => onInputChange(c.id, next)}
        />
      );
    case 'toggle':
      return (
        <ScToggle
          key={c.id}
          label={c.label}
          value={toBool(v)}
          description={c.description}
          descInline={c.descInline}
          onChange={(next) => onInputChange(c.id, next)}
        />
      );
    case 'select':
      return (
        <ScSelect
          key={c.id}
          label={c.label}
          value={toStr(v)}
          options={c.options ?? []}
          description={c.description}
          descInline={c.descInline}
          onChange={(next) => onInputChange(c.id, next)}
        />
      );
    case 'stepper':
      return (
        <ScStepper
          key={c.id}
          label={c.label}
          value={toNum(v)}
          step={c.step ?? 1}
          min={c.min}
          max={c.max}
          unit={c.unit}
          description={c.description}
          descInline={c.descInline}
          onChange={(next) => onInputChange(c.id, next)}
        />
      );
    case 'knob':
      return (
        <ScKnob
          key={c.id}
          label={c.label}
          value={toNum(v)}
          min={c.min ?? 0}
          max={c.max ?? 100}
          step={c.step ?? 1}
          unit={c.unit}
          description={c.description}
          onChange={(next) => onInputChange(c.id, next)}
        />
      );
    default:
      return null;
  }
}

function renderButton(c: ControlConfig, props: ScriptingPanelProps): ReactNode {
  if (c.kind !== 'button') return null;
  return (
    <ScButton
      key={c.id}
      label={c.label}
      description={c.description}
      confirm={c.confirm}
      variant={c.variant}
      mode={c.mode}
      state={props.buttonState[c.id] ?? 'idle'}
      disabled={props.actionsDisabled}
      onRun={() => props.onRun(c.id)}
    />
  );
}

function renderDisplay(c: ControlConfig, props: ScriptingPanelProps): ReactNode {
  const dv = props.displayValues[c.id];
  switch (c.kind) {
    case 'readout':
      return (
        <ScReadout
          key={c.id}
          label={c.label}
          value={dv?.text ?? '—'}
          unit={c.unit}
          state={dv?.state ?? 'ok'}
          stale={dv?.stale ?? false}
          description={c.description}
        />
      );
    case 'status':
      return (
        <ScStatus
          key={c.id}
          label={c.label}
          state={dv?.state ?? 'ok'}
          text={dv?.text ?? '—'}
        />
      );
    case 'gauge':
      return (
        <ScGauge
          key={c.id}
          label={c.label}
          value={dv?.number ?? 0}
          min={c.min ?? 0}
          max={c.max ?? 100}
          unit={c.unit}
          state={dv?.state ?? 'ok'}
        />
      );
    case 'led':
      return (
        <ScLED
          key={c.id}
          label={c.label}
          state={dv?.ledState ?? 'off'}
          color={dv?.ledColor ?? 'off'}
        />
      );
    default:
      return null;
  }
}

function renderConsole(c: ControlConfig, props: ScriptingPanelProps): ReactNode {
  if (c.kind !== 'console') return null;
  const view = props.consoleViews[c.id] ?? EMPTY_CONSOLE;
  return (
    <ScConsole
      key={c.id}
      title={c.label || 'console'}
      state={view.state}
      exit={view.exit}
      lines={view.lines}
      empty={view.empty}
      copied={view.copied}
      streaming={view.streaming}
      stopped={view.stopped}
      showCopy={c.copyButton}
      hideCommand={c.hideCommand}
      autoScroll={c.autoScroll}
      onCopy={() => props.onCopyConsole(c.id)}
    />
  );
}
