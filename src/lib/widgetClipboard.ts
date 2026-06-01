// Widget clipboard — copy a focused tile and paste it back as a new tile.
//
// Cmd/Ctrl+C on the focused tile snapshots its kind + persisted settings into
// this in-app clipboard; Cmd/Ctrl+V adds a fresh tile of that kind and seeds
// the new tile's settings key so the clone arrives fully configured. The
// clipboard is in-memory (per tab) on purpose:
//   - No async Clipboard-API permission prompt, and nothing to clobber when
//     the user is copying real text elsewhere on the page.
//   - The dashboard's own text copy/paste (Logcat selection, Shell input,
//     Mirror device clipboard) is never intercepted — the keydown handlers
//     bail when a text selection or an editable element is in play, so this
//     only fires on the "bare" focused-tile case.
// Cross-tab clone is a deliberate non-goal here; a tab owns its own clipboard.

import { settingsKey } from './tileSettings';
import type { WidgetKind } from '../types';

export interface WidgetClip {
  kind: WidgetKind;
  /** The source tile's persisted settings, or null when it had none yet. */
  settings: Record<string, unknown> | null;
}

let clip: WidgetClip | null = null;

/** Copy a tile into the clipboard: snapshot its persisted settings by id+kind. */
export function copyTileToClipboard(tileId: string, kind: WidgetKind): void {
  clip = { kind, settings: readTileSettings(tileId, kind) };
}

/** The most recently copied tile, or null if nothing has been copied. */
export function getWidgetClip(): WidgetClip | null {
  return clip;
}

/** Forget the copied tile (exported for tests). */
export function clearWidgetClip(): void {
  clip = null;
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
