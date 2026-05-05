// Real ADB / WebUSB transport.
//
// STATUS: STUB. The simulator in `./logGenerator.ts` is wired up by default.
// See docs/TASKS.md → "Wire up real ADB transport" for the full plan.
//
// Recommended path:
//   1. Add `@yume-chan/adb` + `@yume-chan/adb-daemon-webusb` (handles AUTH +
//      framing). They're MIT-licensed and SDK-friendly.
//   2. `requestDevice({ filters: [{ classCode: 0xFF, subclassCode: 0x42, protocolCode: 0x01 }] })`
//   3. AUTH handshake (RSA), then `shell:logcat -v threadtime`.
//   4. Parse each line with `parseLogcatLine` below.
//   5. Resolve PID → package name via `dumpsys package` or `/proc/<pid>/cmdline`
//      (cache aggressively — pid→pkg only changes when a process restarts).
//   6. Push parsed entries onto the same buffer as the simulator.

import type { DeviceInfo, LogEntry, LogLevel } from '../types';

export interface LogStream {
  /** Stop streaming and release the device. */
  stop(): Promise<void>;
}

export interface ConnectOptions {
  onEntry: (entry: LogEntry) => void;
  onError?: (err: Error) => void;
  /** Called when the device disconnects (cable pull, reboot, etc). */
  onDisconnect?: () => void;
}

/**
 * Prompts the user to pick a USB device, performs the ADB handshake, and
 * starts streaming `logcat -v threadtime` lines into `onEntry`.
 *
 * @throws if WebUSB is unavailable or the user cancels the chooser.
 */
export async function connectDevice(_opts: ConnectOptions): Promise<{
  device: DeviceInfo;
  stream: LogStream;
}> {
  if (!('usb' in navigator)) {
    throw new Error('WebUSB is not available in this browser. Use Chrome/Edge over HTTPS.');
  }
  // TODO(real-adb): implement using @yume-chan/adb. See docs/TASKS.md.
  throw new Error('Real ADB transport is not implemented yet. Use simulated data for now.');
}

let _id = 0;

/**
 * Parse one line of `logcat -v threadtime` output:
 *   "MM-DD HH:MM:SS.mmm  PID  TID L TAG: message"
 *
 * Returns `null` for lines that don't match (e.g. logcat banners). The PID
 * is captured but `pkg` is left empty — resolve that out-of-band.
 */
export function parseLogcatLine(
  line: string,
  pidToPkg: (pid: number) => string,
): LogEntry | null {
  // Example: "11-04 12:34:56.789  1234  1235 I MyTag: hello world"
  const m = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWE])\s+([^:]+):\s?(.*)$/.exec(
    line,
  );
  if (!m) return null;
  const [, tsStr, pidStr, tidStr, levelStr, tag, message] = m;

  // threadtime format omits the year — assume current year. This is wrong by
  // up to a day around year boundaries; revisit if anyone cares.
  const now = new Date();
  const yyyy = now.getFullYear();
  const ts = Date.parse(`${yyyy}-${tsStr.replace(' ', 'T')}`);

  const pid = Number(pidStr);
  return {
    id: ++_id,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    pid,
    tid: Number(tidStr),
    pkg: pidToPkg(pid),
    tag: tag.trim(),
    level: levelStr as LogLevel,
    message,
  };
}
