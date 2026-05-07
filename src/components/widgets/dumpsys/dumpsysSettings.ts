// Dumpsys widget — settings shape, defaults, and legacy-key migration.

import { registerSettingsMigration } from '../../../lib/tileSettings';
import type { DumpsysPresetId } from '../../../lib/dumpsys';

export type DumpsysView = 'cards' | 'raw';

export interface DumpsysSettings {
  fontSize: number;
  defaultPreset: DumpsysPresetId;
  defaultView: DumpsysView;
  /**
   * Auto-refresh interval in milliseconds, or `0` for "off". The picker
   * in the toolbar limits choices to a Grafana-style ladder (5s … 5m).
   * Refreshes don't blank the body — the existing result stays put
   * while a small `.ds-refresh-pulse` indicator pulses in the toolbar
   * and the new result swaps in once parsed.
   */
  autoRefreshMs: number;
}

export const DUMPSYS_DEFAULTS: DumpsysSettings = {
  fontSize: 12,
  defaultPreset: 'battery',
  defaultView: 'cards',
  autoRefreshMs: 0,
};

/**
 * Auto-refresh ladder. Picks bottom out at 5s — anything faster makes
 * the underlying `dumpsys` call (which itself takes 50-200ms on a real
 * device) overlap into the next interval. The 30s / 1m / 5m steps are
 * better suited to slow-moving stats like Wi-Fi scan results.
 */
export const AUTO_REFRESH_OPTIONS: ReadonlyArray<{ ms: number; label: string }> = [
  { ms: 0, label: 'Off' },
  { ms: 5_000, label: '5s' },
  { ms: 10_000, label: '10s' },
  { ms: 30_000, label: '30s' },
  { ms: 60_000, label: '1m' },
  { ms: 300_000, label: '5m' },
];

const PRESET_IDS: ReadonlyArray<DumpsysPresetId> = [
  'battery',
  'meminfo',
  'cpuinfo',
  'gfxinfo',
  'wifi',
];

// Legacy key: `weblogcat:dumpsys:<serial>:<tileId>:preset` → settings.defaultPreset
registerSettingsMigration<DumpsysSettings>('dumpsys', {
  legacyKey: (serial, tileId) => `weblogcat:dumpsys:${serial}:${tileId}:preset`,
  apply: (raw, partial) => {
    if (typeof raw !== 'string') return partial;
    if (!PRESET_IDS.includes(raw as DumpsysPresetId)) return partial;
    return { ...partial, defaultPreset: raw as DumpsysPresetId };
  },
});
