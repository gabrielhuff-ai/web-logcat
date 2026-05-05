// Real WebUSB + ADB transport.
//
// Stack:
//   - @yume-chan/adb-daemon-webusb: WebUSB device manager + connection
//   - @yume-chan/adb: ADB protocol, AUTH handshake, subprocess service
//   - @yume-chan/adb-credential-web: RSA key persistence in IndexedDB
//   - @yume-chan/stream-extra: TextDecoderStream + SplitStringStream
//
// Runtime requirements:
//   - Chromium-based browser (WebUSB not in Firefox / Safari)
//   - HTTPS (WebUSB allow-list); localhost is also allowed for dev
//
// Untested against real hardware in this environment. The shape mirrors
// the upstream examples so it should work, but the first integration test
// wants a real Pixel/Galaxy on the staging URL — see docs/TASKS.md.

import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { SplitStringStream, TextDecoderStream } from '@yume-chan/stream-extra';

import type { DeviceInfo, LogEntry, LogLevel } from '../types';

const APP_NAME = 'WebLogcat';

export interface LogStream {
  /** Stop streaming and release the device. */
  stop(): Promise<void>;
}

/**
 * Phases of the connect flow. Callers can use these to drive UI feedback
 * (e.g. swap the Connect button label) without polling.
 *
 *   - `requesting`     — the WebUSB chooser is open; the user is picking
 *                        a device. The chooser may not appear instantly.
 *   - `authenticating` — chooser dismissed; AUTH handshake in flight.
 *                        The user will see an authorisation prompt on the
 *                        device unless this browser+device pair has
 *                        already been trusted.
 *   - `connected`      — Adb session is open; logcat will start streaming.
 */
export type ConnectPhase = 'requesting' | 'authenticating' | 'connected';

export interface ConnectOptions {
  onEntry: (entry: LogEntry) => void;
  onError?: (err: Error) => void;
  onDisconnect?: () => void;
  onPhase?: (phase: ConnectPhase) => void;
}

/**
 * Prompt the user to pick a USB device, complete the AUTH handshake, and
 * start streaming `logcat -v threadtime` lines into `onEntry`.
 *
 * The user must accept the on-device authorisation prompt the first time
 * a given browser+device pair connects. Subsequent connects from the same
 * browser are silent because the RSA key is cached in IndexedDB.
 */
export async function connectDevice(opts: ConnectOptions): Promise<{
  device: DeviceInfo;
  stream: LogStream;
}> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) {
    throw new Error('WebUSB is not available in this browser. Use Chrome/Edge over HTTPS.');
  }

  opts.onPhase?.('requesting');
  const usbDevice = await manager.requestDevice();
  if (!usbDevice) {
    // The user dismissed the chooser.
    throw new Error('No device selected');
  }

  opts.onPhase?.('authenticating');
  const connection = await usbDevice.connect();
  const credentialStore = new AdbWebCredentialStore(APP_NAME);

  const transport = await AdbDaemonTransport.authenticate({
    serial: usbDevice.serial,
    connection,
    credentialStore,
  });

  const adb = new Adb(transport);
  opts.onPhase?.('connected');

  // Resolve metadata for the toolbar.
  const device: DeviceInfo = {
    serial: usbDevice.serial,
    model: adb.banner.model ?? adb.banner.product ?? usbDevice.name ?? 'Unknown',
    androidVersion: await safeGetProp(adb, 'ro.build.version.release'),
  };

  // Watch for disconnect (cable pull, screen lock dropping the connection).
  void adb.disconnected.then(() => {
    opts.onDisconnect?.();
  });

  // Spawn `logcat -v threadtime` and pipe stdout through a line splitter.
  const proc = await adb.subprocess.noneProtocol.spawn(['logcat', '-v', 'threadtime']);

  const pidToPkg = new PidPkgCache(adb);
  const lines = proc.output
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new SplitStringStream('\n'));

  const reader = lines.getReader();
  let stopped = false;

  (async () => {
    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        const entry = parseLogcatLine(value, (pid) => pidToPkg.get(pid));
        if (entry) opts.onEntry(entry);
      }
    } catch (err) {
      if (!stopped) opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  const stream: LogStream = {
    async stop() {
      stopped = true;
      try {
        await proc.kill();
      } catch {
        /* ignore */
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
    },
  };

  return { device, stream };
}

async function safeGetProp(adb: Adb, key: string): Promise<string> {
  try {
    return (await adb.getProp(key)).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Tiny PID → package-name cache. Looks up `/proc/<pid>/cmdline` on first
 * miss and remembers the result. PIDs are recycled when processes restart;
 * we accept the staleness because logcat itself can already lag the actual
 * process state, and it's cheap to invalidate by reconnecting.
 */
class PidPkgCache {
  #adb: Adb;
  #cache = new Map<number, string>();
  #inflight = new Map<number, Promise<string>>();

  constructor(adb: Adb) {
    this.#adb = adb;
  }

  get(pid: number): string {
    const cached = this.#cache.get(pid);
    if (cached) return cached;
    if (!this.#inflight.has(pid)) {
      this.#inflight.set(pid, this.#fetch(pid));
    }
    // Return a placeholder while the lookup is in flight; the next entry
    // for this PID will get the resolved name.
    return '?';
  }

  async #fetch(pid: number): Promise<string> {
    try {
      const out = await this.#adb.subprocess.noneProtocol.spawnWaitText([
        'cat',
        `/proc/${pid}/cmdline`,
      ]);
      // cmdline is NUL-separated; the first segment is argv[0] (process name).
      const name = out.split('\0')[0]?.trim() || `pid:${pid}`;
      this.#cache.set(pid, name);
      this.#inflight.delete(pid);
      return name;
    } catch {
      const fallback = `pid:${pid}`;
      this.#cache.set(pid, fallback);
      this.#inflight.delete(pid);
      return fallback;
    }
  }
}

let _id = 0;

/**
 * Parse one line of `logcat -v threadtime` output:
 *   "MM-DD HH:MM:SS.mmm  PID  TID L TAG: message"
 *
 * Returns `null` for lines that don't match (e.g. logcat banners, blanks).
 */
export function parseLogcatLine(
  line: string,
  pidToPkg: (pid: number) => string,
): LogEntry | null {
  const m =
    /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWE])\s+([^:]+):\s?(.*)$/.exec(
      line,
    );
  if (!m) return null;
  const [, tsStr, pidStr, tidStr, levelStr, tag, message] = m;

  // threadtime format omits the year — assume current year. Wrong by up
  // to a day at year boundaries; not worth the device-clock round trip.
  const yyyy = new Date().getFullYear();
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
