// AdbContext — single shared ADB session for all widgets in a dashboard.
//
// Phase 5 owner: every widget in the connected dashboard reads the active
// device and (when wired up in later phases) the live `Adb` handle from
// here, instead of each opening its own WebUSB connection. The HANDOFF
// §State Management explicitly calls for this — five widgets each
// running their own AUTH handshake would be slow and would also blow
// past the device's "one transport per host" assumption.
//
// Today only the Logcat widget actually streams, and it goes through
// `lib/logStream.ts` (which itself takes the same `LogStream` handle the
// connection produced). Phases 6–9 will reach into `useAdb()` for
// `adb.subprocess.shell.spawn()`, `adb.subprocess.shell.spawnAndWait()`,
// and `adb.sync()`. Until those land, the context's `adb` field stays
// nullable (real-hardware connect provides it; the simulator path leaves
// it null and widgets that require it gate themselves behind a friendly
// "this widget needs a real device" message).

import { createContext, useContext } from 'react';
import type { Adb } from '@yume-chan/adb';
import type { DeviceInfo } from '../types';
import type { LogStream } from './adb';

export interface AdbContextValue {
  /** Active device descriptor, or null when disconnected. */
  device: DeviceInfo | null;
  /** Real ADB handle. Null while disconnected or when using fake data. */
  adb: Adb | null;
  /** Live logcat stream (so widgets can subscribe via `lib/logStream.ts`). */
  stream: LogStream | null;
  /** True ⇒ the active device is the simulator (`device.fake === true`). */
  usingFake: boolean;
}

export const AdbContext = createContext<AdbContextValue | null>(null);

/**
 * Read the active ADB session. Throws if used outside an `<AdbProvider>`
 * — every widget renders inside the dashboard, which is wrapped, so this
 * is a hard contract violation rather than an expected runtime case.
 */
export function useAdb(): AdbContextValue {
  const v = useContext(AdbContext);
  if (!v) {
    throw new Error('useAdb() must be called inside <AdbProvider>');
  }
  return v;
}
