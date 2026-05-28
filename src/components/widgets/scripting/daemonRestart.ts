// Scripting daemon — restart policy, mirroring systemd's `Restart=`.
//
// Pure so the decision is unit-tested away from the runtime. A restart fires
// after a short delay (like systemd's RestartSec) so a command that exits
// immediately can't spin into a tight loop.

import type { RestartPolicy } from './scriptingSettings';

/** Delay before a daemon is restarted, bounding the restart rate. */
export const RESTART_DELAY_MS = 800;

/** Whether a daemon that exited with `exitCode` should be restarted. */
export function shouldRestart(policy: RestartPolicy | undefined, exitCode: number): boolean {
  switch (policy ?? 'no') {
    case 'always':
      return true;
    case 'on-success':
      return exitCode === 0;
    case 'on-failure':
      return exitCode !== 0;
    default:
      return false;
  }
}
