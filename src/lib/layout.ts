// Tile-grid layout helpers: snap math, default layout, localStorage IO.
//
// The grid is a 12-column CSS grid with fixed 56px rows and a 10px gap.
// Tiles snap to integer cells; drag/resize math here translates pixel
// deltas into cell deltas and clamps everything to the grid bounds.
//
// Constants are exported so `TileGrid` and tests can share them.

import type { LayoutState, Tile, WidgetKind } from '../types';

/** Number of columns in the dashboard grid. */
export const COLS = 12;
/** Pixel height of one row. */
export const ROW_PX = 56;
/** Pixel gap between cells. */
export const GAP = 10;
/** Pixel height of the tile header (used by widget-internal layouts). */
export const HEAD_PX = 36;

/** Minimum tile width / height in cells — keeps a tile usable. */
export const MIN_W = 2;
export const MIN_H = 2;

/** localStorage key under which the layout is persisted. */
export const STORAGE_KEY = 'weblogcat-dashboard-v1';

/** Default layout — mirrors `design/v2/source/dashboard.jsx → DEFAULT_LAYOUT`. */
export const DEFAULT_LAYOUT: LayoutState = [
  { id: 'w1', kind: 'mirror', x: 0, y: 0, w: 3, h: 10 },
  { id: 'w2', kind: 'logcat', x: 3, y: 0, w: 9, h: 6 },
  { id: 'w3', kind: 'shell', x: 3, y: 6, w: 5, h: 4 },
  { id: 'w4', kind: 'dumpsys', x: 8, y: 6, w: 4, h: 4 },
];

/**
 * Phase 5 only ships the Logcat widget; the other entries in
 * `DEFAULT_LAYOUT` would render a "coming soon" stub. Until those
 * widgets land in Phase 6–9 we use a single-tile default that still
 * fills the grid sensibly.
 */
export const PHASE_5_DEFAULT_LAYOUT: LayoutState = [
  { id: 'w1', kind: 'logcat', x: 0, y: 0, w: 12, h: 10 },
];

/** Read the persisted layout, falling back to the Phase 5 default. */
export function loadLayout(): LayoutState {
  if (typeof localStorage === 'undefined') return PHASE_5_DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PHASE_5_DEFAULT_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return PHASE_5_DEFAULT_LAYOUT;
    const sane = parsed.filter(isValidTile);
    if (sane.length === 0) return PHASE_5_DEFAULT_LAYOUT;
    return sane;
  } catch {
    return PHASE_5_DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: LayoutState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // quota / privacy mode — silently ignore.
  }
}

const KNOWN_KINDS: ReadonlySet<WidgetKind> = new Set([
  'logcat',
  'shell',
  'dumpsys',
  'files',
  'mirror',
]);

function isValidTile(t: unknown): t is Tile {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    KNOWN_KINDS.has(o.kind as WidgetKind) &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.w) &&
    Number.isFinite(o.h)
  );
}

/** Generate a fresh tile id. Local-monotonic + base36(now) for uniqueness. */
let _id = 0;
export function nextTileId(): string {
  _id += 1;
  return `w${Date.now().toString(36)}${_id.toString(36)}`;
}

/** Width of one column in pixels, given the grid's full inner width. */
export function colWidth(gridWidthPx: number): number {
  // The grid has `COLS` columns separated by `COLS - 1` gaps.
  return (gridWidthPx - GAP * (COLS - 1)) / COLS;
}

/**
 * Move-snap: given a tile's origin position and a pixel delta, return
 * the new (x, y) clamped to the grid bounds.
 */
export function snapMove(
  origin: { x: number; y: number; w: number },
  dxPx: number,
  dyPx: number,
  cwPx: number,
): { x: number; y: number } {
  const dCol = Math.round(dxPx / (cwPx + GAP));
  const dRow = Math.round(dyPx / (ROW_PX + GAP));
  const x = Math.max(0, Math.min(COLS - origin.w, origin.x + dCol));
  const y = Math.max(0, origin.y + dRow);
  return { x, y };
}

/**
 * Resize-snap: given a tile's origin size + position and a pixel delta,
 * return the new (w, h) clamped to (MIN_W, MIN_H) and the right edge of
 * the grid.
 */
export function snapResize(
  origin: { x: number; w: number; h: number },
  dxPx: number,
  dyPx: number,
  cwPx: number,
): { w: number; h: number } {
  const dCol = Math.round(dxPx / (cwPx + GAP));
  const dRow = Math.round(dyPx / (ROW_PX + GAP));
  const w = Math.max(MIN_W, Math.min(COLS - origin.x, origin.w + dCol));
  const h = Math.max(MIN_H, origin.h + dRow);
  return { w, h };
}

/**
 * Find the next free `(x, y)` for a tile of size `(w, h)`. Naive: places
 * at column 0, row = max(y + h) of all existing tiles. Good enough until
 * we want collision-aware placement.
 */
export function placeBelow(layout: LayoutState, w: number): { x: number; y: number } {
  const maxY = layout.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  return { x: 0, y: maxY };
  void w; // reserved — future versions may pack horizontally before going down.
}

/** Total grid rows needed to fit every tile, with a sensible minimum. */
export function totalRows(layout: LayoutState, min = 12): number {
  return Math.max(min, ...layout.map((t) => t.y + t.h));
}
