// Shell widget — settings shape, defaults, and legacy-key migration.

import { registerSettingsMigration } from '../../../lib/tileSettings';

export interface ShellSettings {
  fontSize: number;
  /** Starting cwd for the simulator and `cd <home>` send-on-spawn for real devices. */
  homeDir: string;
  /**
   * When true, the shell channel is opened with `su` so subsequent
   * commands run as root. Best-effort — the toggle is a no-op on
   * devices that don't have `su` (commercial Android). The widget
   * surfaces the failure as a one-line system banner.
   */
  runAsRoot: boolean;
}

export const SHELL_DEFAULTS: ShellSettings = {
  fontSize: 12,
  homeDir: '/sdcard',
  runAsRoot: false,
};

// Legacy key: `weblogcat:shell:<serial>:<tileId>:cwd` → settings.homeDir
registerSettingsMigration<ShellSettings>('shell', {
  legacyKey: (serial, tileId) => `weblogcat:shell:${serial}:${tileId}:cwd`,
  apply: (raw, partial) => {
    if (typeof raw !== 'string' || !raw.startsWith('/')) return partial;
    return { ...partial, homeDir: raw };
  },
});
