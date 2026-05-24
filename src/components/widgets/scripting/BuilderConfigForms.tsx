// Scripting widget — builder per-control config forms.
//
// One form per control kind, rendered in the builder's right pane when a row
// is selected. Each form edits its control via a typed `onPatch`. Derived
// names (function/var) are shown as live help so the author sees exactly what
// the script will see.

import { type ReactNode } from 'react';
import * as Icons from '../../Icons';
import { fnFromLabel, varFromLabel } from '../../../lib/scripting/derive';
import { extractFunctionBody } from '../../../lib/scripting/parseScript';
import type {
  BoundDisplayControl,
  ButtonControl,
  ConsoleControl,
  ControlConfig,
  InputControl,
  SectionControl,
} from './scriptingSettings';

export interface BindTarget {
  value: string;
  label: string;
}

export interface ConfigFormProps {
  control: ControlConfig;
  onPatch: <T extends ControlConfig>(id: string, patch: Partial<T>) => void;
  /** Function names defined in the script (for "bind to" dropdowns). */
  functions: string[];
  /** Output sinks an action can target (consoles + the default console). */
  bindTargets: BindTarget[];
  script: string;
}

export function ConfigForm({ control, onPatch, functions, bindTargets, script }: ConfigFormProps) {
  switch (control.kind) {
    case 'button':
      return (
        <ConfigButton
          control={control}
          onPatch={(p) => onPatch(control.id, p)}
          bindTargets={bindTargets}
          script={script}
        />
      );
    case 'console':
      return <ConfigConsole control={control} onPatch={(p) => onPatch(control.id, p)} />;
    case 'readout':
    case 'status':
    case 'gauge':
    case 'led':
      return (
        <ConfigDisplay control={control} onPatch={(p) => onPatch(control.id, p)} functions={functions} />
      );
    case 'section':
      return <ConfigSection control={control} onPatch={(p) => onPatch(control.id, p)} />;
    default:
      return <ConfigInput control={control} onPatch={(p) => onPatch(control.id, p)} />;
  }
}

// ── Reusable bits ──────────────────────────────────────────────────────────
function FormRow({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="bdr-form-row">
      <label>{label}</label>
      <div className="bdr-form-input">{children}</div>
      {help && <div className="bdr-form-help">{help}</div>}
    </div>
  );
}

function MiniToggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={'bdr-tg ' + (on ? 'on' : '')}
      onClick={() => onChange(!on)}
    >
      <span className="bdr-tg-dot" />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="bdr-seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const num = (s: string, fallback: number): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
};

// ── Input form (text / slider / toggle / select / stepper / knob) ────────────
function ConfigInput({ control, onPatch }: { control: InputControl; onPatch: (p: Partial<InputControl>) => void }) {
  const hasRange = control.kind === 'slider' || control.kind === 'stepper' || control.kind === 'knob';
  const inlineSupported = control.kind !== 'knob';
  return (
    <div className="bdr-form">
      <FormRow label="Label" help={<>Derives the env var. <code>{varFromLabel(control.label)}</code></>}>
        <input value={control.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </FormRow>

      <FormRow label="Description" help="Shown as a tooltip on hover. Optional.">
        <textarea
          className="bdr-form-textarea"
          rows={2}
          value={control.description ?? ''}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </FormRow>
      {inlineSupported && (
        <label className="bdr-form-inlinecheck">
          <input
            type="checkbox"
            checked={control.descInline ?? false}
            onChange={(e) => onPatch({ descInline: e.target.checked })}
          />
          <span>Render the description under the control instead of only on hover.</span>
        </label>
      )}

      {control.kind === 'toggle' ? (
        <FormRow label="Default value" help="Initial on/off state.">
          <MiniToggle
            on={control.defaultValue === true}
            onChange={(v) => onPatch({ defaultValue: v })}
            label="Default value"
          />
        </FormRow>
      ) : control.kind === 'select' ? (
        <>
          <FormRow label="Options" help="Comma-separated list of choices.">
            <input
              value={(control.options ?? []).join(', ')}
              onChange={(e) =>
                onPatch({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
            />
          </FormRow>
          <FormRow label="Default value" help="Initial selection.">
            <input
              value={String(control.defaultValue ?? '')}
              onChange={(e) => onPatch({ defaultValue: e.target.value })}
            />
          </FormRow>
        </>
      ) : hasRange ? (
        <FormRow label="Default value" help="Initial value when the panel loads.">
          <input
            value={String(control.defaultValue ?? 0)}
            onChange={(e) => onPatch({ defaultValue: num(e.target.value, 0) })}
          />
        </FormRow>
      ) : (
        <FormRow label="Default value" help="Initial value when the panel loads.">
          <input
            value={String(control.defaultValue ?? '')}
            onChange={(e) => onPatch({ defaultValue: e.target.value })}
          />
        </FormRow>
      )}

      {hasRange && (
        <FormRow label="Range" help="Inclusive min/max and step size.">
          <input
            style={{ maxWidth: 80 }}
            value={String(control.min ?? 0)}
            onChange={(e) => onPatch({ min: num(e.target.value, 0) })}
          />
          <span style={{ color: 'var(--fg-3)' }}>to</span>
          <input
            style={{ maxWidth: 80 }}
            value={String(control.max ?? 100)}
            onChange={(e) => onPatch({ max: num(e.target.value, 100) })}
          />
          <span style={{ color: 'var(--fg-3)' }}>step</span>
          <input
            style={{ maxWidth: 70 }}
            value={String(control.step ?? 1)}
            onChange={(e) => onPatch({ step: num(e.target.value, 1) })}
          />
        </FormRow>
      )}

      <FormRow label="Unit" help="Suffix shown next to the value. Optional.">
        <input
          value={control.unit ?? ''}
          placeholder="e.g. °C, %, x"
          onChange={(e) => onPatch({ unit: e.target.value })}
        />
      </FormRow>

      <FormRow label="On change" help="Whether changing this value refreshes displays bound to it.">
        <Segmented
          value={control.onChange}
          onChange={(v) => onPatch({ onChange: v })}
          options={[
            { value: 'refresh', label: 'Refresh bound displays' },
            { value: 'none', label: 'Do nothing' },
          ]}
        />
      </FormRow>
    </div>
  );
}

// ── Action button form ───────────────────────────────────────────────────────
function ConfigButton({
  control,
  onPatch,
  bindTargets,
  script,
}: {
  control: ButtonControl;
  onPatch: (p: Partial<ButtonControl>) => void;
  bindTargets: BindTarget[];
  script: string;
}) {
  const fn = fnFromLabel(control.label);
  const body = extractFunctionBody(script, fn);
  return (
    <div className="bdr-form">
      <FormRow label="Label" help={<>Drives the function name: <code>{fn}()</code></>}>
        <input value={control.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </FormRow>
      <FormRow label="Description" help="Shown as a tooltip on hover. Optional.">
        <textarea
          className="bdr-form-textarea"
          rows={2}
          value={control.description ?? ''}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </FormRow>
      <FormRow label="Variant">
        <Segmented
          value={control.variant}
          onChange={(v) => onPatch({ variant: v })}
          options={[
            { value: 'default', label: 'Default' },
            { value: 'subtle', label: 'Subtle' },
            { value: 'destructive', label: 'Destructive' },
          ]}
        />
      </FormRow>
      <FormRow label="Confirm before running" help="Opens a confirmation popover first. Off by default.">
        <MiniToggle on={control.confirm} onChange={(v) => onPatch({ confirm: v })} label="Confirm before running" />
      </FormRow>
      <FormRow label="Bind output to" help="Where stdout/stderr from this function appear.">
        <div className="bdr-form-select">
          <span>{bindTargets.find((t) => t.value === control.bindOutputTo)?.label ?? 'console (default)'}</span>
          <Icons.Chevron size={11} />
          <select value={control.bindOutputTo} onChange={(e) => onPatch({ bindOutputTo: e.target.value })}>
            {bindTargets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </FormRow>
      <FormRow label="Function preview" help={body ? 'Defined in the script above.' : undefined}>
        <pre className={'bdr-fnpreview' + (body ? '' : ' missing')}>
          {body ?? `${fn}() is not defined yet — add it to the script.`}
        </pre>
      </FormRow>
    </div>
  );
}

// ── Console form ──────────────────────────────────────────────────────────────
function ConfigConsole({ control, onPatch }: { control: ConsoleControl; onPatch: (p: Partial<ConsoleControl>) => void }) {
  return (
    <div className="bdr-form">
      <FormRow label="Label" help="Shown in the console header.">
        <input value={control.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </FormRow>
      <FormRow label="Scope" help="Show the most recent run, or scrollback of every run.">
        <Segmented
          value={control.scope}
          onChange={(v) => onPatch({ scope: v })}
          options={[
            { value: 'recent', label: 'Most recent run' },
            { value: 'scrollback', label: 'Scrollback' },
          ]}
        />
      </FormRow>
      <FormRow label="Copy button" help="Show a copy-to-clipboard button in the header.">
        <MiniToggle on={control.copyButton} onChange={(v) => onPatch({ copyButton: v })} label="Copy button" />
      </FormRow>
      <FormRow label="Auto-scroll" help="Scroll to the bottom when new output arrives.">
        <MiniToggle on={control.autoScroll} onChange={(v) => onPatch({ autoScroll: v })} label="Auto-scroll" />
      </FormRow>
    </div>
  );
}

// ── Bound-display form (readout / status / gauge / led) ───────────────────────
function ConfigDisplay({
  control,
  onPatch,
  functions,
}: {
  control: BoundDisplayControl;
  onPatch: (p: Partial<BoundDisplayControl>) => void;
  functions: string[];
}) {
  const bound = control.boundTo;
  const stale = bound && !functions.includes(bound);
  return (
    <div className="bdr-form">
      <FormRow label="Label" help="Display name. Doesn't affect the function name.">
        <input value={control.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </FormRow>
      <FormRow label="Description" help="Shown as a tooltip on hover. Optional.">
        <textarea
          className="bdr-form-textarea"
          rows={2}
          value={control.description ?? ''}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </FormRow>
      <FormRow
        label="Bound to"
        help={stale ? <span style={{ color: 'var(--lvl-w-fg)' }}>{bound}() is not defined in the script.</span> : 'Function whose output fills this display.'}
      >
        <div className="bdr-form-select">
          <span>{bound || 'choose a function'}</span>
          <Icons.Chevron size={11} />
          <select value={bound} onChange={(e) => onPatch({ boundTo: e.target.value })}>
            <option value="">choose a function</option>
            {functions.map((f) => (
              <option key={f} value={f}>
                {f}()
              </option>
            ))}
            {stale && (
              <option value={bound}>{bound} (missing)</option>
            )}
          </select>
        </div>
      </FormRow>
      {control.kind !== 'led' && control.kind !== 'status' && (
        <FormRow label="Unit" help="Suffix shown next to the value.">
          <input style={{ maxWidth: 100 }} value={control.unit ?? ''} onChange={(e) => onPatch({ unit: e.target.value })} />
        </FormRow>
      )}
      {control.kind === 'gauge' && (
        <FormRow label="Range" help="Arc min/max.">
          <input style={{ maxWidth: 80 }} value={String(control.min ?? 0)} onChange={(e) => onPatch({ min: num(e.target.value, 0) })} />
          <span style={{ color: 'var(--fg-3)' }}>to</span>
          <input style={{ maxWidth: 80 }} value={String(control.max ?? 100)} onChange={(e) => onPatch({ max: num(e.target.value, 100) })} />
        </FormRow>
      )}
      <FormRow label="Auto-poll" help="Re-run the bound function on an interval. Off by default.">
        <MiniToggle
          on={control.autoPoll.enabled}
          onChange={(v) => onPatch({ autoPoll: { ...control.autoPoll, enabled: v } })}
          label="Auto-poll"
        />
        <span style={{ color: 'var(--fg-3)', fontSize: 'var(--t-xs)' }}>every</span>
        <input
          style={{ maxWidth: 60 }}
          value={String(control.autoPoll.intervalSec)}
          onChange={(e) => onPatch({ autoPoll: { ...control.autoPoll, intervalSec: num(e.target.value, 2) } })}
        />
        <span style={{ color: 'var(--fg-3)', fontSize: 'var(--t-xs)' }}>seconds</span>
      </FormRow>
      <FormRow label="Refresh on input change" help="Re-run when an input the function reads changes.">
        <MiniToggle
          on={control.refreshOnChange}
          onChange={(v) => onPatch({ refreshOnChange: v })}
          label="Refresh on input change"
        />
      </FormRow>
    </div>
  );
}

// ── Section form ──────────────────────────────────────────────────────────────
function ConfigSection({ control, onPatch }: { control: SectionControl; onPatch: (p: Partial<SectionControl>) => void }) {
  return (
    <div className="bdr-form">
      <FormRow label="Heading" help="The section title shown in the panel.">
        <input value={control.title} onChange={(e) => onPatch({ title: e.target.value })} />
      </FormRow>
      <FormRow label="Description" help="Optional context shown under the heading.">
        <textarea
          className="bdr-form-textarea"
          rows={2}
          value={control.description ?? ''}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </FormRow>
      <FormRow label="" help="A section is non-interactive.">
        <div className="bdr-form-note">
          <Icons.Folder size={11} /> Sections only affect display — they don&apos;t change scoping or the script env.
        </div>
      </FormRow>
    </div>
  );
}
