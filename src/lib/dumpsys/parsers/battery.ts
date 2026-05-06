// Parser for `dumpsys battery` output.
//
// The format is a flat list of `key: value` lines under the "Current
// Battery Service state:" header. Some platforms also expose
// `current_now` and `cycle_count`; we capture them when present and
// leave them undefined otherwise.

/** Decoded `status:` field — Android's `BatteryManager.BATTERY_STATUS_*`. */
export type BatteryStatus =
  | 'unknown'
  | 'charging'
  | 'discharging'
  | 'not-charging'
  | 'full';

/** Decoded `health:` field — `BatteryManager.BATTERY_HEALTH_*`. */
export type BatteryHealth =
  | 'unknown'
  | 'good'
  | 'overheat'
  | 'dead'
  | 'over-voltage'
  | 'failure'
  | 'cold';

export interface BatteryParsed {
  /** Charge level 0..1 (level / scale). null if neither value is present. */
  level: number | null;
  /** Raw `level:` field. */
  levelRaw: number | null;
  /** Raw `scale:` field — almost always 100. */
  scale: number;
  /** Battery temperature in Celsius. null if absent. */
  tempC: number | null;
  /** Voltage in volts. null if absent. */
  voltageV: number | null;
  /**
   * Instantaneous current in milliamps (positive = charging, negative =
   * discharging). null if the device doesn't expose `current_now`.
   */
  currentMa: number | null;
  /** Decoded status. */
  status: BatteryStatus;
  /** Decoded health. */
  health: BatteryHealth;
  /** Cell chemistry as reported by the kernel (e.g. "Li-ion"). */
  technology: string | null;
  /** Power-source flags. */
  powered: { ac: boolean; usb: boolean; wireless: boolean };
  /** Estimated time-to-full in minutes. null if not provided. */
  chargeRemainMin: number | null;
  /** Charge cycle count. null if not exposed. */
  cycleCount: number | null;
}

const STATUS: Record<string, BatteryStatus> = {
  '1': 'unknown',
  '2': 'charging',
  '3': 'discharging',
  '4': 'not-charging',
  '5': 'full',
};

const HEALTH: Record<string, BatteryHealth> = {
  '1': 'unknown',
  '2': 'good',
  '3': 'overheat',
  '4': 'dead',
  '5': 'over-voltage',
  '6': 'failure',
  '7': 'cold',
};

/**
 * Parse `dumpsys battery` output. Tolerant of minor format drift —
 * unknown keys are ignored, missing values come back as `null`.
 */
export function parseBattery(raw: string): BatteryParsed {
  const grab = (key: string): string | null => {
    const re = new RegExp(`^\\s*${escape(key)}:\\s*(.+?)\\s*$`, 'm');
    const m = re.exec(raw);
    return m ? m[1] : null;
  };

  const num = (key: string): number | null => {
    const v = grab(key);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const bool = (key: string): boolean => grab(key) === 'true';

  const levelRaw = num('level');
  const scale = num('scale') ?? 100;
  const tempDc = num('temperature');
  const voltageMv = num('voltage');
  // `current_now` units vary between vendors — most Pixel/Galaxy devices
  // report micro-amps but some emit milli-amps directly. We treat the
  // raw integer as micro-amps when |value| > 100,000 (i.e. > 100mA in
  // mA-units would be unusual for idle, but >100000 in mA-units would
  // be 100A which is impossible; so we use it as a heuristic boundary).
  const currentRaw = num('current_now');
  let currentMa: number | null = null;
  if (currentRaw != null) {
    currentMa = Math.abs(currentRaw) > 10_000 ? Math.round(currentRaw / 1000) : currentRaw;
  }
  const chargeRemainMs = num('charge_time_remaining');
  const cycleCount = num('Charge counter') == null ? null : null; // counter ≠ cycles
  const cyc = num('cycle_count');

  return {
    level: levelRaw != null ? levelRaw / scale : null,
    levelRaw,
    scale,
    tempC: tempDc != null ? tempDc / 10 : null,
    voltageV: voltageMv != null ? voltageMv / 1000 : null,
    currentMa,
    status: STATUS[String(num('status') ?? '')] ?? 'unknown',
    health: HEALTH[String(num('health') ?? '')] ?? 'unknown',
    technology: grab('technology'),
    powered: {
      ac: bool('AC powered'),
      usb: bool('USB powered'),
      wireless: bool('Wireless powered'),
    },
    chargeRemainMin: chargeRemainMs != null ? Math.round(chargeRemainMs / 60_000) : null,
    cycleCount: cyc ?? cycleCount,
  };
}

/** Escape a string for use as a literal inside a regex. */
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
