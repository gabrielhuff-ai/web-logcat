// Dashboard state ↔ URL serialiser.
//
// The dashboard's "shape" (which tiles exist, where they sit on the
// dwindle tree, every per-tile setting incl. filter chips) gets
// flattened into a single base64url-encoded JSON blob and stamped onto
// the URL as `?d=…`. Sharing the URL produces an identical dashboard
// for the next visitor; copy-pasting between browsers / windows hands
// the layout over without round-tripping through localStorage.
//
// We deliberately *don't* encode:
//   - The undo / redo history (recreated fresh on load).
//   - Global `Tweaks` (theme, accent, performance, compact mode) —
//     those are user preferences, not dashboard state.
//   - The simulated stream / log buffer (per-session, transient).
//
// Encoding choice: plain JSON + base64url. Layout + a handful of tile
// settings round-trips at ~1-2 KB after encoding which fits well under
// every browser's URL cap (8 KB+ in practice). Compression would shave
// the size by ~60% but `CompressionStream` is async — that costs us a
// pre-render `await` in `main.tsx` for the initial bootstrap, which
// isn't worth the bytes saved at this scale. If layouts ever balloon,
// swapping the body of `encode` / `decode` for `CompressionStream` is
// a contained change.
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

/** Prefix for per-tile settings keys in localStorage. Mirrors
 *  `tileSettings.ts → settingsKey()` but defined here to keep this
 *  file dependency-free (no React imports — so it can run in
 *  `main.tsx` before the React tree mounts). */
const SETTINGS_PREFIX = 'weblogcat:settings:';

export interface DashboardState {
  /** Same shape `loadLayout()` returns. */
  layout: LayoutState;
  /** Map of full localStorage key → parsed JSON value, scoped to the
   *  per-tile settings bucket. We carry the full key so the restore
   *  path can write straight back to localStorage without having to
   *  reconstruct the (serial, tileId, kind) triple. */
  tileSettings: Record<string, unknown>;
}

/** Snapshot the live dashboard state from localStorage. */
export function captureState(): DashboardState {
  const layout = loadLayout();
  const tileSettings: Record<string, unknown> = {};
  if (typeof localStorage === 'undefined') return { layout, tileSettings };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(SETTINGS_PREFIX)) continue;
    const raw = localStorage.getItem(k);
    if (raw == null) continue;
    try {
      tileSettings[k] = JSON.parse(raw);
    } catch {
      /* ignore malformed entries */
    }
  }
  return { layout, tileSettings };
}

/** Write the snapshot back into localStorage. Used on hydration from a
 *  pasted-in URL — overrides any existing local state so the recipient
 *  sees the sender's exact dashboard. */
export function applyState(state: DashboardState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state.layout));
  } catch {
    /* quota / privacy mode */
  }
  // Wipe any tile-settings keys that aren't in the incoming state, so
  // the URL is the source of truth (the alternative — merging — would
  // leak filter chips from a previous session into the shared link).
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(SETTINGS_PREFIX) && !(k in state.tileSettings)) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  for (const [k, v] of Object.entries(state.tileSettings)) {
    if (!k.startsWith(SETTINGS_PREFIX)) continue; // defence in depth
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
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
 *  throwing — the caller should fall back to localStorage. */
export function decode(s: string): DashboardState | null {
  try {
    const std = s.replace(/-/g, '+').replace(/_/g, '/');
    const padded = std + '==='.slice((std.length + 3) % 4);
    const bin = atob(padded);
    const json = decodeURIComponent(escape(bin));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!('layout' in parsed) || !('tileSettings' in parsed)) return null;
    return parsed as DashboardState;
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
