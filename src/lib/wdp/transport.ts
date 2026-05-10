// `WdpAdbTransport` — yume-chan `AdbTransport` over WDP `/adb-json`.
//
// This is the integration seam: by implementing `AdbTransport` we can
// wrap the result in `new Adb(transport)` and reuse every higher-level
// service yume-chan provides (subprocess, sync, scrcpy …) without
// changing any widget. Each call to `transport.connect(service)` opens
// a fresh `/adb-json` WebSocket parameterised with this device's
// serial.

import { AdbBanner, type AdbFeature, type AdbSocket, type AdbTransport } from '@yume-chan/adb';
import { openWdpAdbSocket } from './adbSocket';

// Safe set of features to advertise. We pick the subset yume-chan's
// higher-level services need and that any reasonably modern device
// (Android 9+) supports. Yume-chan gates several behaviours on these:
//   - ShellV2          → subprocess.shellProtocol (separate stdout/stderr)
//   - Cmd / Abb        → faster command invocation paths
//   - StatV2 / ListV2  → sync stat/list with timestamps
//   - SendReceiveV2    → modern sync push/pull
//   - FixedPushMkdir   → push creates parent dirs
const WDP_FEATURES: readonly AdbFeature[] = [
  'shell_v2',
  'cmd',
  'stat_v2',
  'ls_v2',
  'fixed_push_mkdir',
  'sendrecv_v2',
] as const;

// The daemon picks a payload size during AUTH; we don't see it because
// WDP terminates ADB framing on its side. 256 KiB is the canonical
// modern-device value and yume-chan only uses it as a chunking hint
// for sync uploads.
const WDP_MAX_PAYLOAD = 256 * 1024;

export interface WdpAdbTransportOptions {
  serialNumber: string;
  /** Properties from `/track-devices-json`'s `adbProps` (used to seed the banner). */
  adbProps?: Record<string, string>;
  /** Called when the user-facing device disconnects (currently driven by the tracker). */
  onDisconnected?: () => void;
}

export class WdpAdbTransport implements AdbTransport {
  readonly serial: string;
  readonly maxPayloadSize = WDP_MAX_PAYLOAD;
  readonly banner: AdbBanner;
  readonly disconnected: Promise<void>;
  readonly clientFeatures: readonly AdbFeature[] = WDP_FEATURES;
  #resolveDisconnected!: () => void;
  #closed = false;

  constructor(private opts: WdpAdbTransportOptions) {
    this.serial = opts.serialNumber;
    this.banner = new AdbBanner(
      'device',
      opts.adbProps?.['ro.product.name'],
      opts.adbProps?.['ro.product.model'],
      opts.adbProps?.['ro.product.device'],
      WDP_FEATURES,
    );
    this.disconnected = new Promise<void>((resolve) => {
      this.#resolveDisconnected = resolve;
    });
  }

  connect(service: string): Promise<AdbSocket> {
    if (this.#closed) {
      return Promise.reject(new Error('WDP transport is closed'));
    }
    return openWdpAdbSocket({
      serialNumber: this.serial,
      service,
    });
  }

  addReverseTunnel(): Promise<string> {
    // WDP exposes one outbound service stream per WebSocket; it does not
    // surface ADB's host-side reverse-tunnel registration. Callers that
    // need this (only scrcpy's reverse mode) should use forward tunnels.
    return Promise.reject(
      new Error('Reverse tunnels are not supported over the Device Proxy transport'),
    );
  }

  removeReverseTunnel(): Promise<void> {
    return Promise.resolve();
  }

  clearReverseTunnels(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.opts.onDisconnected?.();
    this.#resolveDisconnected();
    return Promise.resolve();
  }

  /** Mark the transport disconnected without an explicit close (called by the tracker on device loss). */
  notifyDisconnected(): void {
    this.close();
  }
}
