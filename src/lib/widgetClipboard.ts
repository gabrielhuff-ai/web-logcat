// Widget clipboard — copy a focused tile and paste it back as a new tile.
//
// Cmd/Ctrl+C on the focused tile snapshots its kind + persisted settings into
// this clipboard; Cmd/Ctrl+V adds a fresh tile of that kind and seeds the new
// tile's settings key so the clone arrives fully configured.
//
// The clipboard is backed by localStorage (a single slot), so a tile copied
// in one tab can be pasted into another tab/window of the same browser — they
// share the same origin storage. It stays within the browser (not across
// browsers or machines) and needs no Clipboard-API permission. The key sits
// outside the `weblogcat:settings:` namespace, so dashboard export never
// bundles it.
//
// The dashboard's own text copy/paste (Logcat selection, Shell input, Mirror
// device clipboard) is never intercepted — the keydown handlers bail when a
// text selection or an editable element is in play, so this only fires on the
// "bare" focused-tile case.

import { settingsKey } from './tileSettings';
import type { WidgetKind } from '../types';

export interface WidgetClip {
  kind: WidgetKind;
  /** The source tile's persisted settings, or null when it had none yet. */
  settings: Record<string, unknown> | null;
}

/** Single shared clipboard slot. Outside the `weblogcat:settings:` prefix so
 *  it's never swept into a dashboard snapshot. */
const CLIP_KEY = 'weblogcat:widgetClip';

/** Copy a tile into the clipboard: snapshot its persisted settings by id+kind.
 *  Written to localStorage so other tabs of the same browser can paste it. */
export function copyTileToClipboard(tileId: string, kind: WidgetKind): void {
  writeClip({ kind, settings: readTileSettings(tileId, kind) });
}

/** The most recently copied tile (from any tab), or null if nothing valid is
 *  on the clipboard. */
export function getWidgetClip(): WidgetClip | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isClip(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Forget the copied tile (exported for tests). */
export function clearWidgetClip(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CLIP_KEY);
  } catch {
    /* ignore */
  }
}

/** Seed a freshly-added tile's settings so a pasted clone mounts configured.
 *  Must run before the tile mounts — the widget hydrates from this key on its
 *  first render and won't re-read it later without a notify. */
export function seedTileSettings(
  tileId: string,
  kind: WidgetKind,
  settings: Record<string, unknown>,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(settingsKey(tileId, kind), JSON.stringify(settings));
  } catch {
    // quota / privacy mode — the clone just falls back to defaults.
  }
}

function writeClip(clip: WidgetClip): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(clip));
  } catch {
    // quota / privacy mode — copy silently no-ops.
  }
}

function isClip(v: unknown): v is WidgetClip {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.kind !== 'string') return false;
  // settings is either null or a plain object.
  return o.settings === null || (typeof o.settings === 'object' && o.settings !== undefined);
}

function readTileSettings(tileId: string, kind: WidgetKind): Record<string, unknown> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(settingsKey(tileId, kind));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
