// One-shot `getprop` over WDP for use in the discovery dialog.
//
// Opens a per-call `/adb-json` service stream against `shell:getprop
// <key>` for a specific device serial, reads the device's response,
// closes the socket, and returns the trimmed value. Used to fill in
// the device-row name when the daemon's `/track-devices-json`
// snapshot didn't include `ro.product.model` in `adbProps` (some
// WDP daemon versions omit it).
//
// The function is independent of the per-device `WdpAdbTransport`
// because the dialog doesn't have an open `Adb` session yet — the
// devices haven't been connected to. The shell service stream is
// closed immediately after the response arrives, so this doesn't
// claim a long-lived resource on the device.

import { openWdpAdbSocket } from './adbSocket';

interface FetchPropOptions {
  serialNumber: string;
  key: string;
  /** Soft cap for waiting on the response — devices that don't reply in time return null. */
  timeoutMs?: number;
}

export async function fetchDeviceProp(opts: FetchPropOptions): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 1500;
  let socket: Awaited<ReturnType<typeof openWdpAdbSocket>> | null = null;
  try {
    socket = await openWdpAdbSocket({
      serialNumber: opts.serialNumber,
      service: `shell:getprop ${opts.key}`,
    });
  } catch {
    return null;
  }

  const reader = socket.readable.getReader();
  let buffer = '';
  const decoder = new TextDecoder();

  const settled = await Promise.race([
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return true;
          if (value) buffer += decoder.decode(value, { stream: true });
        }
      } catch {
        return false;
      }
    })(),
    new Promise<false>((resolve) => window.setTimeout(() => resolve(false), timeoutMs)),
  ]);

  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
  try {
    socket.close();
  } catch {
    /* ignore */
  }

  if (!settled) return null;
  const trimmed = buffer.trim();
  if (!trimmed) return null;
  return trimmed;
}
