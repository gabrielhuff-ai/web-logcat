// Shared settings primitives — section / row / segmented control / toggle
// pill / numeric slider. All five widget settings bodies render against
// these so the v1 Settings panel's visual language carries through into
// the per-widget modal.

import type { ChangeEvent, ReactNode } from 'react';

export interface SettingsSectionProps {
  label: string;
  children: ReactNode;
}

export function SettingsSection({ label, children }: SettingsSectionProps) {
  return (
    <div className="ws-section">
      <div className="ws-section-label">{label}</div>
      {children}
    </div>
  );
}

export interface SettingsRowProps {
  label: ReactNode;
  children: ReactNode;
}

export function SettingsRow({ label, children }: SettingsRowProps) {
  return (
    <div className="ws-row">
      <div className="ws-row-key">{label}</div>
      <div className="ws-row-control">{children}</div>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
}

export function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div className="ws-seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}

export function Toggle({ on, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`ws-toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="ws-toggle-dot" />
    </button>
  );
}

export interface SliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (next: number) => void;
  valueLabel?: ReactNode;
}

export function Slider({ min, max, step = 1, value, onChange, valueLabel }: SliderProps) {
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (!Number.isNaN(n)) onChange(n);
  };
  return (
    <span className="ws-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onInput}
      />
      {valueLabel != null && <span className="ws-slider-label">{valueLabel}</span>}
    </span>
  );
}

export interface TextInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function TextInput({ value, onChange, placeholder, ariaLabel }: TextInputProps) {
  return (
    <input
      type="text"
      className="ws-text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      autoComplete="off"
    />
  );
}
