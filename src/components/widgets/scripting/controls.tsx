// Scripting widget — presentational control components.
//
// Ported from design/scripting/source/scripting-controls.jsx. Inputs carry a
// value (text / slider / toggle / select / stepper / knob); displays render
// the output of a run (console / status / readout / gauge / led); section is a
// visual-only heading. Styling lives in styles/widgets/scripting.css. These
// are dumb components — value/run wiring is driven by the widget body.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../../Icons';
import { InfoDot, Tooltip } from './Tooltip';
import { renderMarkdown } from './markdown';

/** Run lifecycle reflected by interactive controls. */
export type CtrlState = 'idle' | 'active' | 'busy' | 'error';
/** Semantic state reflected by displays. */
export type DisplayState = 'ok' | 'warn' | 'err' | 'busy';

export function SpinnerDot({ size = 11 }: { size?: number }) {
  const style: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    border: '1.5px solid var(--bg-3)',
    borderTopColor: 'var(--accent)',
    animation: 'sc-spin 700ms linear infinite',
    verticalAlign: 'middle',
  };
  return <span style={style} />;
}

function ControlLabel({
  children,
  description,
  descInline,
}: {
  children: React.ReactNode;
  description?: string;
  descInline?: boolean;
}) {
  return (
    <div className="sc-lbl">
      <span className="sc-lbl-text">{children}</span>
      {description && !descInline && <InfoDot description={description} />}
    </div>
  );
}

// ─────────────────────────────── Inputs ───────────────────────────────

export interface ScButtonProps {
  label: string;
  state?: CtrlState;
  description?: string;
  confirm?: boolean;
  variant?: 'default' | 'subtle' | 'destructive';
  exitCode?: number;
  disabled?: boolean;
  onRun?: () => void;
}

export function ScButton({
  label,
  state = 'idle',
  description,
  confirm,
  variant = 'default',
  exitCode = 1,
  disabled,
  onRun,
}: ScButtonProps) {
  const busy = state === 'busy';
  const err = state === 'error';
  const active = state === 'active';
  const [confirming, setConfirming] = useState(false);
  const cls = [
    'sc-btn',
    variant === 'subtle' && 'subtle',
    variant === 'destructive' && 'destructive',
    active && 'active',
    busy && 'busy',
    err && 'err',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (confirm && !confirming) {
      setConfirming(true);
      return;
    }
    onRun?.();
  };

  // Esc cancels the confirmation, matching the other modals.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const button = (
    <button type="button" className={cls} disabled={disabled || busy} onClick={handleClick}>
      {busy ? <SpinnerDot /> : <Icons.PlayCircle size={12} />}
      <span>{label}</span>
      {confirm && !busy && !err && <Icons.Lock size={10} />}
      {err && <span className="sc-btn-exit">exit {exitCode}</span>}
    </button>
  );

  return (
    <>
      {description ? (
        <Tooltip content={description} className="sc-tip-wrap">
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {/* Portaled to body + centred so it can't be clipped by the tile's
          overflow — a dimmed/blurred backdrop like the other dialogs. */}
      {confirming &&
        createPortal(
          <>
            <div className="sc-confirm-back" onClick={() => setConfirming(false)} />
            <div className="sc-confirm-pop" role="dialog" aria-label={`Confirm ${label}`}>
              <div className="sc-confirm-pop-msg">Run {label}?</div>
              <div className="sc-confirm-pop-row">
                <button type="button" className="sc-confirm-pop-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="sc-confirm-pop-btn run"
                  onClick={() => {
                    setConfirming(false);
                    onRun?.();
                  }}
                >
                  Run
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export interface ScToggleProps {
  label: string;
  value: boolean;
  state?: CtrlState;
  description?: string;
  descInline?: boolean;
  onChange?: (v: boolean) => void;
}

export function ScToggle({ label, value, state = 'idle', description, descInline, onChange }: ScToggleProps) {
  const err = state === 'error';
  const busy = state === 'busy';
  return (
    <div className={'sc-toggle-row' + (err ? ' err' : '') + (descInline && description ? ' with-desc' : '')}>
      <div className="sc-toggle-lbl">
        <ControlLabel description={description} descInline={descInline}>
          {label}
        </ControlLabel>
        {descInline && description && <div className="sc-desc-inline">{renderMarkdown(description)}</div>}
      </div>
      <div className="sc-toggle-end">
        {busy && <SpinnerDot size={10} />}
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          className={'sc-tg ' + (value ? 'on' : '')}
          onClick={() => onChange?.(!value)}
        >
          <span className="sc-tg-dot" />
        </button>
      </div>
    </div>
  );
}

export interface ScSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  state?: CtrlState;
  description?: string;
  descInline?: boolean;
  onChange?: (v: number) => void;
}

export function ScSlider({
  label,
  min,
  max,
  step = 1,
  value,
  unit = '',
  state = 'idle',
  description,
  descInline,
  onChange,
}: ScSliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const err = state === 'error';
  const busy = state === 'busy';
  return (
    <div className={'sc-slider' + (err ? ' err' : '')}>
      <div className="sc-slider-head">
        <ControlLabel description={description} descInline={descInline}>
          {label}
        </ControlLabel>
        <span className="sc-val">
          {value}
          {unit && <span className="sc-unit">{unit}</span>}
          {busy && (
            <span style={{ marginLeft: 6 }}>
              <SpinnerDot size={9} />
            </span>
          )}
        </span>
      </div>
      {descInline && description && <div className="sc-desc-inline">{renderMarkdown(description)}</div>}
      <div className="sc-track">
        <div className="sc-fill" style={{ width: pct + '%' }} />
        <div className="sc-thumb" style={{ left: `calc(${pct}% - 7px)` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange?.(Number(e.target.value))}
        />
      </div>
      <div className="sc-range">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export interface ScTextProps {
  label: string;
  value: string;
  placeholder?: string;
  state?: CtrlState;
  description?: string;
  descInline?: boolean;
  onChange?: (v: string) => void;
}

export function ScText({ label, value, placeholder, state = 'idle', description, descInline, onChange }: ScTextProps) {
  const err = state === 'error';
  const active = state === 'active';
  return (
    <div className={'sc-text' + (err ? ' err' : '') + (active ? ' active' : '')}>
      <ControlLabel description={description} descInline={descInline}>
        {label}
      </ControlLabel>
      <div className="sc-text-input">
        <input
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={label}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
      {descInline && description && <div className="sc-desc-inline">{renderMarkdown(description)}</div>}
    </div>
  );
}

export interface ScSelectProps {
  label: string;
  value: string;
  options: string[];
  state?: CtrlState;
  description?: string;
  descInline?: boolean;
  onChange?: (v: string) => void;
}

export function ScSelect({ label, value, options, state = 'idle', description, descInline, onChange }: ScSelectProps) {
  return (
    <div className={'sc-select' + (state === 'error' ? ' err' : '')}>
      <ControlLabel description={description} descInline={descInline}>
        {label}
      </ControlLabel>
      <div className="sc-select-input">
        <span>{value}</span>
        <Icons.Chevron size={11} />
        <select value={value} aria-label={label} onChange={(e) => onChange?.(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {descInline && description && <div className="sc-desc-inline">{renderMarkdown(description)}</div>}
    </div>
  );
}

export interface ScStepperProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  state?: CtrlState;
  description?: string;
  descInline?: boolean;
  onChange?: (v: number) => void;
}

export function ScStepper({
  label,
  value,
  step = 1,
  min = -Infinity,
  max = Infinity,
  unit = '',
  state = 'idle',
  description,
  descInline,
  onChange,
}: ScStepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // Round to the step grid to avoid float drift (0.1 + 0.2 …).
  const round = (n: number) => {
    const p = step > 0 ? Math.round(n / step) * step : n;
    return Math.round(p * 1e6) / 1e6;
  };
  return (
    <div className={'sc-step' + (state === 'error' ? ' err' : '')}>
      <ControlLabel description={description} descInline={descInline}>
        {label}
      </ControlLabel>
      <div className="sc-step-input">
        <button
          type="button"
          className="sc-step-btn"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange?.(clamp(round(value - step)))}
        >
          −
        </button>
        <span className="sc-step-val">
          {value}
          {unit && <span className="sc-unit">{unit}</span>}
        </span>
        <button
          type="button"
          className="sc-step-btn"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange?.(clamp(round(value + step)))}
        >
          +
        </button>
      </div>
      {descInline && description && <div className="sc-desc-inline">{renderMarkdown(description)}</div>}
    </div>
  );
}

export interface ScKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  state?: CtrlState;
  description?: string;
  onChange?: (v: number) => void;
}

export function ScKnob({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '%',
  state = 'idle',
  description,
  onChange,
}: ScKnobProps) {
  const t = max > min ? (value - min) / (max - min) : 0;
  const a0 = -135;
  const a1 = 135;
  const cur = a0 + 270 * t;
  const r = 22;
  const cx = 30;
  const cy = 30;
  const toXY = (deg: number): [number, number] => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(a0);
  const [ex, ey] = toXY(cur);
  const [fx, fy] = toXY(a1);
  const largeBg = a1 - a0 > 180 ? 1 : 0;
  const largeFg = cur - a0 > 180 ? 1 : 0;
  const [px, py] = toXY(cur);
  const err = state === 'error';
  const busy = state === 'busy';

  // Vertical pointer-drag adjusts the value (drag up = increase).
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!onChange) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startVal: value };
    },
    [onChange, value],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      if (!d || !onChange) return;
      // 150px of travel spans the full range.
      const delta = ((d.startY - e.clientY) / 150) * (max - min);
      const raw = d.startVal + delta;
      const snapped = step > 0 ? Math.round(raw / step) * step : raw;
      onChange(Math.min(max, Math.max(min, snapped)));
    },
    [onChange, min, max, step],
  );
  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
  }, []);

  return (
    <div className={'sc-knob' + (err ? ' err' : '')}>
      <svg
        width="60"
        height="60"
        viewBox="0 0 60 60"
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (!onChange) return;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(Math.min(max, value + step));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(Math.max(min, value - step));
          }
        }}
      >
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeBg} 1 ${fx} ${fy}`}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeFg} 1 ${ex} ${ey}`}
          fill="none"
          stroke={err ? 'var(--lvl-e-fg)' : 'var(--accent)'}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={12} fill="var(--bg-1)" stroke="var(--line)" strokeWidth="1" />
        <line
          x1={cx}
          y1={cy}
          x2={cx + (px - cx) * 0.55}
          y2={cy + (py - cy) * 0.55}
          stroke="var(--fg-0)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <div className="sc-knob-meta">
        <div className="sc-knob-val">
          {Math.round(value)}
          {unit && <span className="sc-unit">{unit}</span>}
          {busy && (
            <span style={{ marginLeft: 6 }}>
              <SpinnerDot size={9} />
            </span>
          )}
        </div>
        <div className="sc-knob-label">
          {label}
          {description && <InfoDot description={description} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── Displays ───────────────────────────────

export type ConsoleLineKind = 'cmd' | 'out' | 'err';
export interface ConsoleLine {
  kind: ConsoleLineKind;
  text: string;
}

export interface ScConsoleProps {
  title?: string;
  state?: CtrlState;
  exit?: number;
  lines?: ConsoleLine[];
  empty?: boolean;
  copied?: boolean;
  showCopy?: boolean;
  onCopy?: () => void;
}

export function ScConsole({
  title = 'console',
  state = 'idle',
  exit = 0,
  lines = [],
  empty = false,
  copied = false,
  showCopy = true,
  onCopy,
}: ScConsoleProps) {
  const busy = state === 'busy';
  const err = state === 'error' || exit !== 0;
  return (
    <div className="sc-console">
      <div className="sc-console-head">
        <span className="sc-console-glyph">
          <Icons.Terminal size={11} />
        </span>
        <span className="sc-console-title">{title}</span>
        <span style={{ flex: 1 }} />
        {busy ? (
          <span className="sc-exit busy">
            <SpinnerDot size={8} /> running…
          </span>
        ) : empty ? (
          <span className="sc-exit idle">— no runs yet</span>
        ) : (
          <span className={'sc-exit ' + (err ? 'err' : 'ok')}>
            <span className="sc-exit-dot" /> exit {exit}
          </span>
        )}
        {!empty && !busy && showCopy && (
          <button
            type="button"
            className={'sc-console-copy' + (copied ? ' done' : '')}
            data-tip={copied ? 'Copied' : 'Copy output'}
            onClick={onCopy}
            aria-label="Copy output"
          >
            {copied ? <Icons.Check size={11} /> : <Icons.Copy size={11} />}
          </button>
        )}
      </div>
      <div className="sc-console-body">
        {empty || lines.length === 0 ? (
          <div className="sc-console-empty">Output from the most recent run appears here.</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={'sc-console-line k-' + l.kind}>
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export interface ScStatusProps {
  label: string;
  state?: DisplayState;
  text?: string;
}

export function ScStatus({ label, state = 'ok', text = 'OK' }: ScStatusProps) {
  const isBusy = state === 'busy';
  return (
    <div className={'sc-status ' + state}>
      <span className="sc-status-dot" />
      <span className="sc-status-text">
        <span className="sc-status-label">{label}</span>
        <span className="sc-status-val">{isBusy ? 'checking…' : text}</span>
      </span>
      {isBusy && <SpinnerDot size={9} />}
    </div>
  );
}

export interface ScReadoutProps {
  label: string;
  value: string;
  unit?: string;
  state?: DisplayState;
  stale?: boolean;
  description?: string;
}

export function ScReadout({ label, value, unit = '', state = 'ok', stale = false, description }: ScReadoutProps) {
  return (
    <div className={'sc-readout ' + state + (stale ? ' stale' : '')}>
      <div className="sc-readout-row">
        <span className="sc-readout-val">{value}</span>
        {unit && <span className="sc-readout-unit">{unit}</span>}
      </div>
      <div className="sc-readout-label">
        {label}
        {description && <InfoDot description={description} />}
        {stale && (
          <span className="sc-readout-stale">
            <SpinnerDot size={7} /> refreshing
          </span>
        )}
      </div>
    </div>
  );
}

export interface ScGaugeProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  state?: DisplayState;
}

export function ScGauge({ label, value, min = 0, max = 100, unit = '%', state = 'ok' }: ScGaugeProps) {
  const t = Math.max(0, Math.min(1, max > min ? (value - min) / (max - min) : 0));
  const a0 = -120;
  const a1 = 120;
  const cur = a0 + (a1 - a0) * t;
  const r = 38;
  const cx = 50;
  const cy = 52;
  const toXY = (deg: number): [number, number] => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(a0);
  const [ex, ey] = toXY(cur);
  const [fx, fy] = toXY(a1);
  const largeBg = a1 - a0 > 180 ? 1 : 0;
  const largeFg = cur - a0 > 180 ? 1 : 0;
  const color = state === 'err' ? 'var(--lvl-e-fg)' : t > 0.85 ? 'var(--lvl-w-fg)' : 'var(--accent)';
  return (
    <div className={'sc-gauge ' + state}>
      <svg width="100" height="70" viewBox="0 0 100 70">
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeBg} 1 ${fx} ${fy}`}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeFg} 1 ${ex} ${ey}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          style={{ transition: 'all 360ms var(--ease-out)' }}
        />
        <text
          x="50"
          y="48"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="var(--fg-0)"
          fontFamily="var(--font-mono)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(value)}
          <tspan fontSize="10" fill="var(--fg-3)" dx="1">
            {unit}
          </tspan>
        </text>
        <text x={sx - 2} y={sy + 9} textAnchor="end" fontSize="8" fill="var(--fg-3)" fontFamily="var(--font-mono)">
          {min}
        </text>
        <text x={fx + 2} y={fy + 9} textAnchor="start" fontSize="8" fill="var(--fg-3)" fontFamily="var(--font-mono)">
          {max}
        </text>
      </svg>
      <div className="sc-gauge-label">{label}</div>
    </div>
  );
}

export type LedColor = 'green' | 'amber' | 'red' | 'blue' | 'off';
export interface ScLEDProps {
  label: string;
  state?: string;
  color?: LedColor;
}

export function ScLED({ label, state = 'on', color = 'green' }: ScLEDProps) {
  return (
    <div className={'sc-led ' + state}>
      <span className={'sc-led-bulb led-' + color} />
      <div className="sc-led-meta">
        <div className="sc-led-label">{label}</div>
        <div className="sc-led-state">{state}</div>
      </div>
    </div>
  );
}

export interface ScSectionProps {
  title: string;
  description?: string;
}

export function ScSection({ title, description }: ScSectionProps) {
  return (
    <div className="sc-section">
      <div className="sc-section-meta">
        <div className="sc-section-head">
          <span className="sc-section-title">{title}</span>
        </div>
        {description && <div className="sc-section-desc">{renderMarkdown(description)}</div>}
      </div>
    </div>
  );
}
