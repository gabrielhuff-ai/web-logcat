// Logcat widget — settings shape, defaults, and legacy-key migration.
//
// The shape lives here so the widget body and the modal's settings
// body can both type against a single source. The migration registers
// the v1/v2 `weblogcat:filters:<serial>:<tileId>` key as a legacy fold
// into `settings.filters`.

import { registerSettingsMigration } from '../../../lib/tileSettings';
import type { Filter, LevelEnabled } from '../../../types';

export interface LogcatSettings {
  /** Body font size in CSS pixels. Slider range 10–16. */
  fontSize: number;
  density: 'compact' | 'comfortable';
  heatmap: boolean;
  wrap: boolean;
  showTimestamp: boolean;
  showPid: boolean;
  showProcess: boolean;
  showTag: boolean;
  showLevel: boolean;
  levelEnabled: LevelEnabled;
  /** Slim form: `{ type, value }` only — chip ids / colors are rebuilt at runtime. */
  filters: ReadonlyArray<{ type: Filter['type']; value: string }>;
  autoScroll: boolean;
  paused: boolean;
}

export const LOGCAT_DEFAULTS: LogcatSettings = {
  fontSize: 12,
  density: 'compact',
  heatmap: false,
  wrap: false,
  showTimestamp: true,
  showPid: false,
  showProcess: true,
  showTag: true,
  showLevel: true,
  levelEnabled: { V: true, D: true, I: true, W: true, E: true },
  filters: [],
  autoScroll: true,
  paused: false,
};

// Legacy key: `weblogcat:filters:<serial>:<tileId>` → settings.filters
registerSettingsMigration<LogcatSettings>('logcat', {
  legacyKey: (serial, tileId) => `weblogcat:filters:${serial}:${tileId}`,
  apply: (raw, partial) => {
    try {
      const parsed = JSON.parse(raw) as Array<{ type: Filter['type']; value: string }>;
      if (!Array.isArray(parsed)) return partial;
      const cleaned = parsed
        .filter((p) => p && typeof p.value === 'string' && typeof p.type === 'string')
        .map((p) => ({ type: p.type, value: p.value }));
      return { ...partial, filters: cleaned };
    } catch {
      return partial;
    }
  },
});
