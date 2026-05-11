// Lightweight, passive WDP availability probe used to decide which
// transport the empty-state primary button should default to.
//
// Opens a short-lived `/track-devices-json` WebSocket and waits for
// the first inbound frame (snapshot or error envelope). Any response
// counts as "reachable" — even an ORIGIN_NOT_ALLOWLISTED error means
// the daemon is up and only the per-origin allowlist needs a
// (separate, user-gesture-driven) approval. Times out fast so the
// empty state stays snappy when WDP isn't installed.
//
// This is intentionally separate from `WdpTracker.start()`: probing
// must NOT trigger the origin-approval popup, since the probe runs on
// mount without a user gesture and any `window.open` from there would
// be blocked.

import { AsyncWebSocket } from './asyncWebSocket';
import { WDP_TRACK_DEVICES_URL } from './constants';

/** How long to wait for any inbound frame before declaring WDP unreachable. */
const DEFAULT_PROBE_TIMEOUT_MS = 600;

export async function probeWdpReachable(
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
  url: string = WDP_TRACK_DEVICES_URL,
): Promise<boolean> {
  const aws = await withTimeout(AsyncWebSocket.connect(url), timeoutMs);
  if (!aws) return false;
  let reachable = false;
  try {
    const got = await Promise.race([
      aws.waitForString().then((s) => s ?? ''),
      new Promise<null>((r) => window.setTimeout(() => r(null), timeoutMs)),
    ]);
    reachable = got !== null;
  } catch {
    reachable = false;
  } finally {
    aws.close();
  }
  return reachable;
}

function withTimeout<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: T | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = window.setTimeout(() => finish(null), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        finish(v);
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
    );
  });
}
