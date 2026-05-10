// Optional transport seam for Android Web Device Proxy.
//
//   https://tools.google.com/dlpage/android_web_device_proxy
//
// Goal: complement (not replace) WebUSB so users with the SDK installed
// can reach emulators and Wi-Fi-attached devices, share access with a
// running Android Studio / scrcpy / `adb` CLI, and connect from browsers
// that don't ship WebUSB. WebUSB stays the zero-install default.
//
// Status: architectural prototype.
//   - Discovery (`probeProxyAvailability`) is real: it opens a short-
//     lived WebSocket against the configured localhost endpoint and
//     reports reachable / not-reachable.
//   - Connect (`connectViaProxy`) deliberately throws. The proxy's wire
//     protocol is not publicly documented and a working implementation
//     needs to be derived from a local capture against the installed
//     daemon. See the inline TODO at `connectViaProxy`.
//
// Why a stub instead of a guess: shipping a guessed protocol would
// require a rewrite the moment we capture the real one, and any e2e
// coverage we add against the guess is fictional. The shape here gives
// the UI + docs + tests a stable seam to plug into; the missing piece
// is well isolated.

import type { DeviceInfo } from '../types';

/**
 * Placeholder localhost endpoint. The real port is whatever the
 * installed proxy daemon binds to; we don't know it yet because the
 * vendor download page is gated and the binary hasn't been captured.
 *
 * When the real value is known, replace `PLACEHOLDER_PORT` with it (or
 * a small list of candidates probed in order) and drop this comment.
 */
const PLACEHOLDER_PORT = 41057;
export const PROXY_ENDPOINT = `ws://127.0.0.1:${PLACEHOLDER_PORT}`;
const PROBE_TIMEOUT_MS = 250;

export interface ProxyAvailability {
  /** True iff a WebSocket handshake completed against the endpoint. */
  reachable: boolean;
  /** Endpoint that was probed — useful for diagnostics / future config. */
  endpoint: string;
}

/**
 * Try to open a WebSocket to the proxy's localhost endpoint with a
 * short timeout. Returns reachability without negotiating any protocol
 * — the moment the handshake completes we close the socket.
 *
 * Tight timeout because this runs on every empty-state mount and the
 * common case (no proxy installed) must not delay the UI.
 *
 * Notes for the eventual real implementation:
 *   - Browsers treat localhost as a "potentially trustworthy" origin,
 *     so an HTTPS page connecting to ws://127.0.0.1 is allowed in
 *     Chromium without mixed-content errors. Firefox is stricter; the
 *     proxy may need to expose wss:// with a trusted local cert there.
 *   - The proxy must serve `Sec-WebSocket-Protocol` / CORS such that
 *     the WebLogcat origin is accepted. Worth confirming on first
 *     install.
 */
export function probeProxyAvailability(
  endpoint: string = PROXY_ENDPOINT,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ProxyAvailability> {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') {
      resolve({ reachable: false, endpoint });
      return;
    }

    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore — socket may already be closed */
      }
      resolve({ reachable, endpoint });
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(endpoint);
    } catch {
      resolve({ reachable: false, endpoint });
      return;
    }

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    ws.onopen = () => finish(true);
    ws.onerror = () => finish(false);
    ws.onclose = () => finish(false);
  });
}

export interface ProxyConnectOptions {
  endpoint?: string;
}

/**
 * Open a session against the Device Proxy and return the same shape
 * that `connectDevice` (WebUSB) returns, so callers can swap transports
 * without branching on the rest of the pipeline.
 *
 * TODO(proxy-protocol): not implemented.
 *
 * What this needs to do once the wire format is known:
 *   1. Open a WebSocket to `endpoint`.
 *   2. Negotiate the proxy's session-establishment frame(s). The
 *      product description says it "proxies all ADB communications
 *      through the local ADB server", so it likely speaks either
 *      (a) a thin envelope around raw ADB packets, in which case we
 *      can adapt `@yume-chan/adb`'s `AdbDaemonTransport` over a
 *      WebSocket-backed connection, or (b) a higher-level RPC, in
 *      which case we write a new client.
 *   3. List devices via the proxy (multi-device support — the proxy's
 *      headline benefit) and resolve the user's pick to a session.
 *   4. Build an `Adb` handle and return `{ device, stream, adb }`
 *      matching `connectDevice` in `lib/adb.ts`.
 *
 * Until that's done, calling this throws so the UI can degrade
 * gracefully via the same `friendlyConnectError` path WebUSB uses.
 */
export function connectViaProxy(
  _opts: ProxyConnectOptions = {},
): Promise<{ device: DeviceInfo; stream: never; adb: never }> {
  return Promise.reject(
    new Error(
      'Device Proxy transport is not yet implemented. Use Connect a device (WebUSB) for now.',
    ),
  );
}
