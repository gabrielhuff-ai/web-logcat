// Files widget — settings shape, defaults, and legacy-key migration.

import { registerSettingsMigration } from '../../../lib/tileSettings';

export type FilesViewMode = 'list' | 'icons';

export interface FilesSettings {
  fontSize: number;
  /** Path used when the widget mounts and no other cwd is recorded. */
  startingPath: string;
  /** Whether the left tree pane is visible. */
  treeVisible: boolean;
  /** List (Finder rows) vs Icons (Finder grid) layout for the file area. */
  viewMode: FilesViewMode;
}

export const FILES_DEFAULTS: FilesSettings = {
  fontSize: 12,
  // `/sdcard/Download` (rather than just `/sdcard`) is where the
  // simulator's canned files live, and on a real Pixel it's the most
  // common landing spot for user-generated content. Users see content
  // immediately on first mount instead of an empty list of subdirs.
  startingPath: '/sdcard/Download',
  treeVisible: true,
  viewMode: 'list',
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
