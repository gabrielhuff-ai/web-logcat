// WDP connect entrypoint. Mirrors `lib/adb.ts:connectDevice()` in shape
// so `App.tsx` can plug it into the same `{ device, stream, adb }`
// pipeline. The only differences from the WebUSB path are:
//
//   - No WebUSB chooser; the device is selected by `serialNumber` from
//     the picker the UI built from `/track-devices-json`.
//   - The transport closes by tearing down each open WebSocket rather
//     than via `AdbDaemonTransport.close()`.

import { Adb } from '@yume-chan/adb';
import {
  type ConnectOptions,
  type LogStream,
  safeGetProp,
  startLogcatStream,
} from '../adb';
import type { DeviceInfo } from '../../types';
import { WdpAdbTransport } from './transport';
import type { WdpDevice } from './schema';
import { wdpDeviceReady } from './schema';

export interface WdpConnectOptions extends ConnectOptions {
  /** Selected device from `/track-devices-json`. */
  device: WdpDevice;
}

export async function connectViaWdp(opts: WdpConnectOptions): Promise<{
  device: DeviceInfo;
  stream: LogStream;
  adb: Adb;
}> {
  // The discovery panel routes PROXY_UNAUTHORIZED through its own
  // popup-then-wait flow before forwarding here, so reaching this point
  // with an unready device means the snapshot transition didn't land in
  // time. Surface a clear message instead of silently proceeding.
  if (!wdpDeviceReady(opts.device)) {
    if (opts.device.proxyStatus === 'PROXY_UNAUTHORIZED') {
      throw new Error(
        'Device authorisation has not propagated yet. Accept the prompt on the device, wait a moment, and click Connect again.',
      );
    }
    throw new Error(`Device is not ready (${opts.device.adbStatus}).`);
  }

  opts.onPhase?.('authenticating');
  const transport = new WdpAdbTransport({
    serialNumber: opts.device.serialNumber,
    adbProps: opts.device.proxyStatus === 'ADB' ? opts.device.adbProps : undefined,
  });
  const adb = new Adb(transport);
  opts.onPhase?.('connected');

  // Prefer the snapshot's adbProps where present (zero round-trips),
  // fall back to `getprop` over the proxy. WDP doesn't reliably ship
  // `ro.product.model` in adbProps on all daemon versions, so without
  // this fallback the topbar would show the serial.
  const adbProps = opts.device.proxyStatus === 'ADB' ? opts.device.adbProps : undefined;
  const [modelProp, androidVersion] = await Promise.all([
    adbProps?.['ro.product.model'] ?? safeGetProp(adb, 'ro.product.model'),
    adbProps?.['ro.build.version.release'] ?? safeGetProp(adb, 'ro.build.version.release'),
  ]);
  const model =
    (modelProp && modelProp !== 'unknown' && modelProp) ||
    adb.banner.model ||
    adbProps?.['ro.product.name'] ||
    opts.device.serialNumber;

  const device: DeviceInfo = {
    serial: opts.device.serialNumber,
    model,
    androidVersion,
    transport: 'proxy',
  };

  void adb.disconnected.then(() => {
    opts.onDisconnect?.();
  });

  const stream = await startLogcatStream(adb, opts, () => transport.close());

  return { device, stream, adb };
}
