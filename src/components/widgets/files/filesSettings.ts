// Files widget — settings shape, defaults, and legacy-key migration.

import { registerSettingsMigration } from '../../../lib/tileSettings';

export interface FilesSettings {
  fontSize: number;
  /** Path used when the widget mounts and no other cwd is recorded. */
  startingPath: string;
}

export const FILES_DEFAULTS: FilesSettings = {
  fontSize: 12,
  startingPath: '/sdcard',
};

// Legacy key: `weblogcat:files:<serial>:<tileId>:cwd` → settings.startingPath
// (We treat the persisted last-seen cwd as the starting path on next
//  mount; the widget body then keeps writing the live cwd back into
//  settings as the user navigates, so behaviour is preserved.)
registerSettingsMigration<FilesSettings>('files', {
  legacyKey: (serial, tileId) => `weblogcat:files:${serial}:${tileId}:cwd`,
  apply: (raw, partial) => {
    if (typeof raw !== 'string' || !raw.startsWith('/')) return partial;
    return { ...partial, startingPath: raw };
  },
});
