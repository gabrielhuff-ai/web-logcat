// Dashboard import/export — explicit, on-demand sharing.
//
// Replaces the old live `?d=` URL writer. A snapshot bundles the layout AND
// every per-tile setting (so a shared dashboard arrives complete, not just its
// shell). The user exports on demand (clipboard / file / link) and imports on
// demand (paste / file); the URL is no longer rewritten as the dashboard
// changes.
//
// Design points:
//   - Serial-free: per-tile settings are keyed by (tileId, kind) both in the
//     snapshot and in live storage, never by a device serial — a serial is
//     meaningless on the recipient's machine, and tile settings are global
//     per dashboard anyway (see `tileSettings.ts`).
//   - Compressed: gzip + base64url (async CompressionStream). Fine here — this
//     runs on an explicit button, not on the bootstrap path. Falls back to
//     plain base64url where CompressionStream is unavailable; a one-char codec
//     marker says which.
//   - Safe import: scripting panels run shell, so import disarms auto-poll
//     and daemon auto-start (nothing executes on load) and the UI gates
//     script-bearing imports behind an explicit acknowledgement.

import { loadLayout, saveLayout } from './layout';
import { settingsKey } from './tileSettings';
import type { LayoutState, WidgetKind } from '../types';

export interface DashboardSnapshot {
  v: 1;
  layout: LayoutState;
  /** tileId → kind → settings object. Serial-free. */
  settings: Record<string, Record<string, unknown>>;
}

const SHARE_PARAM = 'share';
const PENDING_KEY = 'weblogcat:pendingImport';
/** Encoded-length ceiling for offering a shareable link (fragment, not query,
 *  so server/CDN caps don't apply — this guards the browser + readability). */
export const URL_SIZE_LIMIT = 6000;

// ---- base64url helpers -----------------------------------------------------

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '==='.slice((std.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(json: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('gzip');
  const stream = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

// ---- encode / decode -------------------------------------------------------

export async function encodeSnapshot(s: DashboardSnapshot): Promise<string> {
  const json = JSON.stringify(s);
  const gz = await gzip(json);
  if (gz) return 'A' + bytesToB64url(gz);
  return 'B' + bytesToB64url(new TextEncoder().encode(json));
}

export async function decodeSnapshot(str: string): Promise<DashboardSnapshot | null> {
  try {
    if (!str) return null;
    const codec = str[0];
    const body = str.slice(1);
    let json: string;
    if (codec === 'A') json = await gunzip(b64urlToBytes(body));
    else if (codec === 'B') json = new TextDecoder().decode(b64urlToBytes(body));
    else return null;
    const parsed: unknown = JSON.parse(json);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSnapshot(v: unknown): v is DashboardSnapshot {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && typeof o.layout === 'object' && o.layout !== null && typeof o.settings === 'object' && o.settings !== null;
}

// ---- capture / apply -------------------------------------------------------

/** Snapshot the live dashboard (layout + every tile's global settings). */
export function captureSnapshot(): DashboardSnapshot {
  const layout = loadLayout();
  const settings: Record<string, Record<string, unknown>> = {};
  if (typeof localStorage !== 'undefined') {
    const prefix = 'weblogcat:settings:';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      // Global keys are exactly `<tileId>:<kind>`; skip any lingering
      // per-serial keys (`<serial>:<tileId>:<kind>`) from the old scheme.
      const parts = key.slice(prefix.length).split(':');
      if (parts.length !== 2) continue;
      const [tileId, kind] = parts;
      try {
        const val: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (val == null) continue;
        (settings[tileId] ??= {})[kind] = val;
      } catch {
        /* skip malformed entry */
      }
    }
  }
  return { v: 1, layout, settings };
}

/** Write a snapshot into localStorage, then the caller re-renders.
 *  Scripting auto-poll is disarmed so nothing executes on load post-import. */
export function applySnapshot(s: DashboardSnapshot): void {
  if (typeof localStorage === 'undefined') return;
  saveLayout(s.layout);
  for (const [tileId, byKind] of Object.entries(s.settings)) {
    for (const [kind, val] of Object.entries(byKind)) {
      const safe = kind === 'scripting' ? disarmScripting(val) : val;
      try {
        localStorage.setItem(settingsKey(tileId, kind as WidgetKind), JSON.stringify(safe));
      } catch {
        /* quota / privacy mode */
      }
    }
  }
}

/** Disable anything that would run shell on load — auto-poll on bound displays
 *  and auto-start on daemons — so an imported panel never executes on its own.
 *  The user re-arms these intentionally via the builder. */
export function disarmScripting(val: unknown): unknown {
  if (!val || typeof val !== 'object') return val;
  const o = val as { controls?: unknown };
  if (!Array.isArray(o.controls)) return val;
  const controls = o.controls.map((c) => {
    if (!c || typeof c !== 'object') return c;
    let ctl = c as Record<string, unknown>;
    if ('autoPoll' in ctl && ctl.autoPoll && typeof ctl.autoPoll === 'object') {
      ctl = { ...ctl, autoPoll: { ...(ctl.autoPoll as object), enabled: false } };
    }
    if ('autoStart' in ctl && ctl.autoStart) {
      ctl = { ...ctl, autoStart: false };
    }
    return ctl;
  });
  return { ...o, controls };
}

/** True when the snapshot carries a scripting panel with real (non-comment)
 *  script code — the signal to warn before importing. */
export function hasScripts(s: DashboardSnapshot): boolean {
  for (const byKind of Object.values(s.settings)) {
    const sc = byKind.scripting as { script?: unknown } | undefined;
    if (sc && typeof sc.script === 'string' && scriptHasCode(sc.script)) return true;
  }
  return false;
}

function scriptHasCode(script: string): boolean {
  return script.split('\n').some((l) => {
    const t = l.trim();
    return t !== '' && !t.startsWith('#');
  });
}

// ---- URL + pending-import plumbing -----------------------------------------

export function fitsInUrl(encoded: string): boolean {
  return encoded.length <= URL_SIZE_LIMIT;
}

export function buildShareUrl(encoded: string): string {
  const u = new URL(window.location.href);
  u.hash = `${SHARE_PARAM}=${encoded}`;
  return u.toString();
}

/** Read a `#share=…` payload from the current URL, if present. */
export function readShareFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash).get(SHARE_PARAM);
}

export function clearShareFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  } catch {
    /* ignore */
  }
}

/** Stash a decoded snapshot to apply once a device (serial) is known. */
export function stashPendingImport(s: DashboardSnapshot): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// A pending import can arrive after the dashboard is already mounted (e.g. the
// user navigates to a share link in the same tab). This bus lets the dashboard
// consume it live instead of waiting for a reload.
const pendingListeners = new Set<() => void>();

/** Subscribe to "a pending import is available". Returns an unsubscribe fn. */
export function onPendingImport(cb: () => void): () => void {
  pendingListeners.add(cb);
  return () => {
    pendingListeners.delete(cb);
  };
}

/** Wake subscribers after stashing a pending import. */
export function notifyPendingImport(): void {
  for (const cb of pendingListeners) cb();
}

/** Take (read + clear) any pending import stashed at boot. */
export function takePendingImport(): DashboardSnapshot | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
