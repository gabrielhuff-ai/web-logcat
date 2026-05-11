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
// The Device Proxy (WDP) path uses the same `Adb` handle by implementing
// yume-chan's `AdbTransport` over WDP's `/adb-json` sockets — see
// `lib/wdp/transport.ts`. The post-connect logcat-stream helper at the
// bottom of this file is shared between both paths.

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
  adb: Adb;
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
    transport: 'usb',
  };

  // Watch for disconnect (cable pull, screen lock dropping the connection).
  void adb.disconnected.then(() => {
    opts.onDisconnect?.();
  });

  const stream = await startLogcatStream(adb, opts, async () => {
    await transport.close();
  });

  return { device, stream, adb };
}

/**
 * Spawn `logcat -v threadtime` on `adb`, parse each line, and feed
 * entries into `opts.onEntry`. Returns a `LogStream` whose `stop()` ends
 * the subprocess, cancels the reader, and tears down the transport via
 * `closeTransport`.
 *
 * Shared between the WebUSB path (this file) and the WDP path
 * (`lib/wdp/connect.ts`) — both yield an `Adb` instance and only differ
 * in how the underlying transport is torn down.
 */
export async function startLogcatStream(
  adb: Adb,
  opts: Pick<ConnectOptions, 'onEntry' | 'onError'>,
  closeTransport: () => Promise<void> | void,
): Promise<LogStream> {
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

  return {
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
        await closeTransport();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Map a raw connect-time error to a user-friendly toast string.
 * The browser's native `transferIn` / `transferOut` failures bubble up
 * with a flat "A transfer error has occurred" message that doesn't
 * help the user choose what to try next; this helper substitutes a
 * short, actionable line for the common shapes (USB transfer, device
 * disconnect, picker dismissal, claim-blocked) and falls back to the
 * raw message otherwise.
 */
export function friendlyConnectError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/No device selected/i.test(raw)) return 'No device selected.';
  if (/transferIn|transferOut/i.test(raw) && /transfer error/i.test(raw)) {
    return (
      "USB transfer failed mid-handshake. Try unplugging and replugging the device, then accept the on-device debugging prompt. (If it keeps failing, swap the USB cable — flaky cables are the most common cause.)"
    );
  }
  if (/disconnected/i.test(raw)) {
    return 'Device disconnected. Replug the cable and try again.';
  }
  if (/claim.*interface|protected interface|already in use|device.*in use/i.test(raw)) {
    return (
      "Couldn't claim the USB interface — something else is already holding the device. " +
      'If you have `adb` running (Android Studio, scrcpy, the Web Device Proxy daemon, …) try ' +
      '`adb kill-server` and reconnect. On Windows replace the WinUSB driver if needed.'
    );
  }
  if (/WebUSB is not available/i.test(raw)) return raw; // already friendly
  return raw;
}

export async function safeGetProp(adb: Adb, key: string): Promise<string> {
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
 *
 * NB: we deliberately ignore the timestamp portion of the line and use
 * `Date.now()` (ingest time on the host) as the entry's `ts`. The reason:
 *
 *   - The threadtime format omits any timezone information.
 *   - Devices set their own clock & TZ; if the device's wall clock differs
 *     from the host browser's by more than a couple of seconds (very
 *     common — phones drift, dev devices are often left on a previous TZ)
 *     parsing the string as local-host time produces ts values offset from
 *     reality, which breaks the rate display ("logs / sec") and the 60s
 *     heatmap buckets — *every* incoming entry appears to fall inside the
 *     last second, so the rate pegs to MAX_LOGS.
 *   - Using ingest time means timestamps reflect "when this row reached
 *     the viewer", which is what a developer streaming logs cares about
 *     and is robust to device clock skew.
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
  const [, , pidStr, tidStr, levelStr, tag, message] = m;
  const pid = Number(pidStr);
  const trimmedTag = tag.trim();
  const level = levelStr as LogLevel;
  // Stack-trace detection. The `AndroidRuntime` + level-E case covers
  // the canonical "FATAL EXCEPTION" block — `logGenerator.ts` already
  // emits that shape on the simulator. But real devices emit plenty
  // of stack traces under other tags (system_server's
  // `HealthPackageChangesMonitor`, `PackageManager`, individual app
  // tags, …) and the user expectation is "every Java-style stack
  // trace folds into the crash widget". We supplement the tag check
  // with a content-based one that looks for any of the syntactic
  // markers a JVM stack trace exhibits:
  //   - `\tat <fqcn>.<method>(File.java:42)` — frames
  //   - `Caused by: …` — chained throwables
  //   - `… 27 more` — frame elision
  //   - `<package>.<Throwable>: <message>` — the throwable header
  // Combined with the `crashHeads` detector in `<LogcatWidget/>`
  // (first contiguous-run match becomes the head, rest collapse
  // under it), this is enough to fold typical real-device traces.
  const isCrashLine =
    level === 'E' &&
    (trimmedTag === 'AndroidRuntime' || looksLikeStackTrace(message));
  return {
    id: ++_id,
    ts: Date.now(),
    pid,
    tid: Number(tidStr),
    pkg: pidToPkg(pid),
    tag: trimmedTag,
    level,
    message,
    isCrashLine,
  };
}

const STACK_FRAME_RE = /^\s*at\s+[\w$.]+(?:\.<init>)?\(/;
const CAUSED_BY_RE = /^\s*Caused by:/;
const FRAME_ELISION_RE = /^\s*\.\.\.\s*\d+\s+(?:more|common\s+frames)/;
const THROWABLE_HEADER_RE = /^[\w$.]+(?:Exception|Error|Throwable)(?::\s|$)/;

function looksLikeStackTrace(message: string): boolean {
  return (
    STACK_FRAME_RE.test(message) ||
    CAUSED_BY_RE.test(message) ||
    FRAME_ELISION_RE.test(message) ||
    THROWABLE_HEADER_RE.test(message)
  );
}
