// Dashboard state ↔ URL serialiser.
//
// The dashboard's "shape" (which tiles exist, where they sit on the
// dwindle tree) gets flattened into a single base64url-encoded JSON
// blob and stamped onto the URL as `?d=…`. Sharing the URL produces
// an identical dashboard for the next visitor; copy-pasting between
// browsers / windows hands the layout over without round-tripping
// through localStorage.
//
// We deliberately *don't* encode:
//   - The undo / redo history (recreated fresh on load).
//   - Global `Tweaks` (theme, accent, performance, compact mode) —
//     those are user preferences, not dashboard state.
//   - The simulated stream / log buffer (per-session, transient).
//   - Per-tile settings (filter chips, font sizes, density, …). The
//     URL was hitting browser caps (Chrome ~8 KB; some servers / CDNs
//     much lower) once a user had ~5+ tiles with their own settings.
//     Per-tile state lives in localStorage and is keyed by `(serial,
//     tileId, kind)`, so it follows the user across sessions on the
//     same browser; the trade-off is that a shared URL transports
//     only the layout shell and the recipient's existing per-tile
//     localStorage (or the per-widget defaults) supplies the rest.
//
// Encoding choice: plain JSON + base64url. Layout-only round-trips at
// well under 1 KB after encoding for any realistic tree. Compression
// would shave more but `CompressionStream` is async — that costs us a
// pre-render `await` in `main.tsx` for the initial bootstrap, which
// isn't worth the bytes saved at this scale.
//
// Update timing: `scheduleUrlUpdate()` debounces by 250ms — long
// enough that mid-resize ratio chatter doesn't thrash the URL bar,
// short enough that a layout change feels persistent ("I added a
// widget; the URL reflects it").

import {
  STORAGE_KEY as LAYOUT_STORAGE_KEY,
  loadLayout,
} from './layout';
import type { LayoutState } from '../types';

/** Query param name on the URL. Short to keep links compact. */
const URL_PARAM = 'd';

export interface DashboardState {
  /** Same shape `loadLayout()` returns. */
  layout: LayoutState;
}

/** Snapshot the live dashboard state from localStorage. */
export function captureState(): DashboardState {
  return { layout: loadLayout() };
}

/** Write the snapshot back into localStorage. Used on hydration from a
 *  pasted-in URL — overrides the existing layout so the recipient
 *  sees the sender's exact dashboard shape. Per-tile settings are
 *  intentionally NOT carried in the URL (see file header) so they
 *  remain whatever the recipient already has locally. */
export function applyState(state: DashboardState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout));
  } catch {
    /* quota / privacy mode */
  }
}

/** Encode a state blob to base64url JSON. Synchronous so it can run
 *  inside the debounced URL writer without extra plumbing. */
export function encode(state: DashboardState): string {
  const json = JSON.stringify(state);
  // `unescape(encodeURIComponent(...))` is the canonical "UTF-8 to
  // binary string" trick before `btoa` — it survives non-ASCII (e.g.
  // emoji in filter chips, Asian-language tag names).
  const bin = unescape(encodeURIComponent(json));
  return (
    btoa(bin)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  );
}

/** Reverse of `encode`. Returns null on malformed input rather than
 *  throwing — the caller should fall back to localStorage. Accepts
 *  both the slim `{ layout }` shape and the legacy `{ layout,
 *  tileSettings }` shape from older shared URLs (the extra field is
 *  silently dropped). */
export function decode(s: string): DashboardState | null {
  try {
    const std = s.replace(/-/g, '+').replace(/_/g, '/');
    const padded = std + '==='.slice((std.length + 3) % 4);
    const bin = atob(padded);
    const json = decodeURIComponent(escape(bin));
    const parsed = JSON.parse(json) as { layout?: unknown };
    if (!parsed || typeof parsed !== 'object') return null;
    if (!('layout' in parsed)) return null;
    return { layout: parsed.layout as LayoutState };
  } catch {
    return null;
  }
}

/**
 * If the current URL carries a `?d=…` payload, decode it and write
 * the result back into localStorage so the React tree picks it up on
 * its first render (no special-case prop threading required). Returns
 * true when the URL did contain a valid payload; false otherwise.
 *
 * Call from `main.tsx` *before* `createRoot().render(...)`.
 */
export function applyUrlStateToStorage(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const v = params.get(URL_PARAM);
  if (!v) return false;
  const state = decode(v);
  if (!state) return false;
  applyState(state);
  return true;
}

// ---- Debounced URL writer -------------------------------------------------

let writeTimer: number | null = null;

/**
 * Schedule a URL update reflecting the current localStorage snapshot.
 * Coalesces calls within 250ms so mid-resize ratio chatter / fast
 * sequences of edits don't thrash the URL bar. Uses
 * `history.replaceState` so the back/forward stack isn't polluted —
 * navigating back from the dashboard always lands on the previous
 * page, not on an earlier layout intermediate.
 */
export function scheduleUrlUpdate(): void {
  if (typeof window === 'undefined') return;
  if (writeTimer !== null) {
    window.clearTimeout(writeTimer);
  }
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    const state = captureState();
    const encoded = encode(state);
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, encoded);
    try {
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* security errors in some embedded contexts — ignore */
    }
  }, 250);
}

/** Flush any pending URL update synchronously. Useful for tests. */
export function flushUrlUpdate(): void {
  if (writeTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(writeTimer);
    writeTimer = null;
  }
}
