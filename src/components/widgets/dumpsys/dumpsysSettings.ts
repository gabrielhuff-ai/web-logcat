// Dumpsys widget — settings shape, defaults, and legacy-key migration.

import { registerSettingsMigration } from '../../../lib/tileSettings';
import type { DumpsysPresetId } from '../../../lib/dumpsys';

export type DumpsysView = 'cards' | 'raw';

export interface DumpsysSettings {
  fontSize: number;
  defaultPreset: DumpsysPresetId;
  defaultView: DumpsysView;
}

export const DUMPSYS_DEFAULTS: DumpsysSettings = {
  fontSize: 12,
  defaultPreset: 'battery',
  defaultView: 'cards',
};

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
