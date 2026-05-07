// Battery preset card grid.
//
// Two cards: charge ring + state, and health/voltage/temp/technology.

import type { BatteryParsed } from '../../../lib/dumpsys/parsers/battery';

const STATUS_LABEL: Record<BatteryParsed['status'], string> = {
  unknown: 'Unknown',
  charging: 'Charging',
  discharging: 'Discharging',
  'not-charging': 'Not charging',
  full: 'Full',
};

const HEALTH_LABEL: Record<BatteryParsed['health'], string> = {
  unknown: 'Unknown',
  good: 'Good',
  overheat: 'Overheating',
  dead: 'Dead',
  'over-voltage': 'Over voltage',
  failure: 'Failure',
  cold: 'Cold',
};

export function BatteryCard({ data }: { data: BatteryParsed }) {
  const pct = data.level != null ? Math.round(data.level * 100) : null;
  const sources: string[] = [];
  if (data.powered.usb) sources.push('USB');
  if (data.powered.ac) sources.push('AC');
  if (data.powered.wireless) sources.push('Wireless');

  return (
    <>
      <div className="ds-card">
        <div className="ds-card-head">Charge</div>
        <div className="ds-charge">
          <BatteryGlyph pct={pct ?? 0} charging={data.status === 'charging'} />
          <div className="ds-charge-meta">
            <div className="ds-charge-pct">
              {pct != null ? pct : '—'}
              <span>%</span>
            </div>
            <div className="ds-charge-state">
              {STATUS_LABEL[data.status]}
              {sources.length > 0 ? ` · ${sources.join(' · ')}` : ''}
            </div>
            {data.chargeRemainMin != null && data.status === 'charging' && (
              <div className="ds-charge-eta">
                ≈ {Math.floor(data.chargeRemainMin / 60)}h{' '}
                {data.chargeRemainMin % 60}m until full
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ds-card">
        <div className="ds-card-head">Health</div>
        <Row k="State" v={HEALTH_LABEL[data.health]} />
        <Row
          k="Temperature"
          v={data.tempC != null ? `${data.tempC.toFixed(1)} °C` : '—'}
          warn={data.tempC != null && data.tempC > 38}
        />
        <Row
          k="Voltage"
          v={data.voltageV != null ? `${data.voltageV.toFixed(2)} V` : '—'}
        />
        {data.currentMa != null && (
          <Row k="Current" v={`${data.currentMa} mA`} />
        )}
        <Row k="Technology" v={data.technology ?? '—'} />
        {data.cycleCount != null && (
          <Row k="Cycles" v={String(data.cycleCount)} />
        )}
      </div>
    </>
  );
}

function Row({ k, v, warn = false }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="ds-card-row">
      <span className="k">{k}</span>
      <span className={'v' + (warn ? ' warn' : '')}>{v}</span>
    </div>
  );
}

function BatteryGlyph({ pct, charging }: { pct: number; charging: boolean }) {
  // Body is x=2..70 (68 wide); the fill sits at x=6 with a 4px inset
  // on the left and we mirror that with a 4px inset on the right, so
  // the fill spans at most 60px (was 66, which made 100% overshoot
  // the body's right edge by 2px and looked asymmetric).
  const fillW = Math.max(2, Math.round((pct / 100) * 60));
  const colorVar =
    pct < 15
      ? 'var(--lvl-e-fg)'
      : pct < 30
        ? 'var(--lvl-w-fg)'
        : 'oklch(0.74 0.16 150)';
  return (
    <svg width="76" height="40" viewBox="0 0 76 40" aria-hidden>
      <rect
        x="2"
        y="6"
        width="68"
        height="28"
        rx="5"
        fill="none"
        stroke="var(--fg-2)"
        strokeWidth="2"
      />
      <rect x="71" y="14" width="4" height="12" rx="1" fill="var(--fg-2)" />
      <rect
        x="6"
        y="10"
        width={fillW}
        height="20"
        rx="2"
        fill={colorVar}
        style={{ transition: 'width 400ms var(--ease-out)' }}
      />
      {charging && (
        <path
          d="M 36 12 L 30 22 H 36 L 32 30 L 42 18 H 36 Z"
          fill="oklch(1 0 0 / 0.85)"
          stroke="oklch(0 0 0 / 0.4)"
          strokeWidth="0.5"
        />
      )}
    </svg>
  );
}
