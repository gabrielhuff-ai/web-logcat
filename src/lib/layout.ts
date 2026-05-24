// Hyprland-style (dwindle) binary-tree layout for the dashboard.
//
// The dashboard is a fixed-size, non-scrolling viewport. Widgets share
// every pixel: each "split" node carves its parent area along one axis
// at a configurable ratio, and each leaf hosts one tile. Adding a tile
// splits an existing leaf in two; removing a tile collapses the parent
// split back into its sibling. Resizing happens at the seam between two
// siblings — no per-tile drag handles exist, because tile bounds are
// implied by the tree.
//
// The pixel snapping / column maths from the v1 grid layout are gone —
// there is no grid any more. Everything is proportional.

import type {
  BarMode,
  LayoutNode,
  LayoutState,
  Tile,
  WidgetKind,
} from '../types';

/** Hard floor on a split's ratio so a sibling can't be squashed into 0px. */
export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;

/** localStorage key under which the layout is persisted. */
export const STORAGE_KEY = 'weblogcat-dashboard-v2';

// ---- Default layout --------------------------------------------------------

/**
 * Default arrangement — a single Logcat tile filling the dashboard.
 * Shown only on first visit (no saved layout); thereafter `loadLayout()`
 * restores whatever the user had open. The topbar's "Clear" button
 * empties the dashboard back to the empty-state CTA, so users add
 * subsequent widgets explicitly via "+ Add widget".
 */
export function defaultLayout(): LayoutState {
  const tiles: Record<string, Tile> = {
    w_logcat: { id: 'w_logcat', kind: 'logcat' },
  };
  const tree: LayoutNode = { type: 'leaf', id: 'w_logcat' };
  return { tiles, tree, focusId: 'w_logcat' };
}

/**
 * Empty layout — used when the user removes every tile. The dashboard
 * renders the empty-state CTA at this point.
 */
export function emptyLayout(): LayoutState {
  return { tiles: {}, tree: null, focusId: null };
}

// ---- Persistence -----------------------------------------------------------

const KNOWN_KINDS: ReadonlySet<WidgetKind> = new Set([
  'logcat',
  'shell',
  'dumpsys',
  'files',
  'mirror',
  'scripting',
]);

/** Read the persisted layout, falling back to the current default. */
export function loadLayout(): LayoutState {
  if (typeof localStorage === 'undefined') return defaultLayout();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout();
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return defaultLayout();
    if (parsed.tree && !leavesMatchTiles(parsed.tree, parsed.tiles)) {
      return defaultLayout();
    }
    return migrateLayout(parsed);
  } catch {
    return defaultLayout();
  }
}

/**
 * One-shot migration applied to whatever `loadLayout()` finds on disk.
 * The dwindle layout's first cut shipped with `Tile.barsHidden:
 * boolean`; the tristate landed later as `Tile.barMode`. Translate
 * `barsHidden: true` → `'hideBars'` so users keep their preference
 * across the upgrade. Anything already on the new shape passes
 * through unchanged.
 */
function migrateLayout(s: LayoutState): LayoutState {
  let mutated = false;
  const tiles: Record<string, Tile> = {};
  for (const [id, tile] of Object.entries(s.tiles)) {
    const legacy = (tile as Tile & { barsHidden?: boolean }).barsHidden;
    if (legacy != null && tile.barMode == null) {
      mutated = true;
      const { barsHidden: _legacy, ...rest } =
        tile as Tile & { barsHidden?: boolean };
      tiles[id] = { ...rest, barMode: legacy ? 'hideBars' : 'show' };
    } else {
      tiles[id] = tile;
    }
  }
  return mutated ? { ...s, tiles } : s;
}

export function saveLayout(layout: LayoutState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // quota / privacy mode — silently ignore.
  }
}

function isValidState(v: unknown): v is LayoutState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.tiles !== 'object' || o.tiles === null) return false;
  for (const t of Object.values(o.tiles)) {
    if (!isValidTile(t)) return false;
  }
  if (o.tree !== null && !isValidNode(o.tree)) return false;
  if (o.focusId !== null && typeof o.focusId !== 'string') return false;
  return true;
}

function isValidTile(t: unknown): t is Tile {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    KNOWN_KINDS.has(o.kind as WidgetKind)
  );
}

function isValidNode(n: unknown): n is LayoutNode {
  if (!n || typeof n !== 'object') return false;
  const o = n as Record<string, unknown>;
  if (o.type === 'leaf') return typeof o.id === 'string';
  if (o.type === 'split') {
    return (
      (o.dir === 'row' || o.dir === 'col') &&
      typeof o.ratio === 'number' &&
      Number.isFinite(o.ratio) &&
      isValidNode(o.a) &&
      isValidNode(o.b)
    );
  }
  return false;
}

function leavesMatchTiles(
  tree: LayoutNode,
  tiles: Record<string, Tile>,
): boolean {
  for (const id of leafIds(tree)) {
    if (!tiles[id]) return false;
  }
  return true;
}

// ---- Tree helpers ----------------------------------------------------------

/** All leaf ids, in left-to-right / top-to-bottom traversal order. */
export function leafIds(tree: LayoutNode | null): string[] {
  if (!tree) return [];
  if (tree.type === 'leaf') return [tree.id];
  return [...leafIds(tree.a), ...leafIds(tree.b)];
}

/** Count tiles of a given kind — used to enforce `maxInstances`. */
export function countByKind(layout: LayoutState, kind: WidgetKind): number {
  let n = 0;
  for (const t of Object.values(layout.tiles)) if (t.kind === kind) n += 1;
  return n;
}

/**
 * Generate a fresh tile id. Local-monotonic + base36(now) for uniqueness.
 */
let _id = 0;
export function nextTileId(): string {
  _id += 1;
  return `w${Date.now().toString(36)}${_id.toString(36)}`;
}

/**
 * Right-most / bottom-most leaf — the default split target when the user
 * adds a new widget without an explicit focus.
 */
export function rightmostLeafId(tree: LayoutNode | null): string | null {
  if (!tree) return null;
  if (tree.type === 'leaf') return tree.id;
  return rightmostLeafId(tree.b);
}

/**
 * Find a leaf by id. Returns the path as a sequence of `'a' | 'b'` choices
 * to follow from the root, or `null` if the leaf isn't in the tree.
 */
export function findPath(
  tree: LayoutNode | null,
  id: string,
): Array<'a' | 'b'> | null {
  if (!tree) return null;
  if (tree.type === 'leaf') return tree.id === id ? [] : null;
  const left = findPath(tree.a, id);
  if (left) return ['a', ...left];
  const right = findPath(tree.b, id);
  if (right) return ['b', ...right];
  return null;
}

function nodeAt(tree: LayoutNode, path: ReadonlyArray<'a' | 'b'>): LayoutNode {
  let n: LayoutNode = tree;
  for (const step of path) {
    if (n.type !== 'split') throw new Error('path runs through a leaf');
    n = step === 'a' ? n.a : n.b;
  }
  return n;
}

function replaceAt(
  tree: LayoutNode,
  path: ReadonlyArray<'a' | 'b'>,
  next: LayoutNode,
): LayoutNode {
  if (path.length === 0) return next;
  if (tree.type !== 'split') throw new Error('path runs through a leaf');
  const [step, ...rest] = path;
  if (step === 'a') return { ...tree, a: replaceAt(tree.a, rest, next) };
  return { ...tree, b: replaceAt(tree.b, rest, next) };
}

// ---- Mutations -------------------------------------------------------------

/**
 * Add a tile to the layout. Splits the focused leaf; if no leaf is
 * focused or the focus is stale, splits the right-most leaf. Pass
 * `splitDir` explicitly to control direction — the renderer in
 * `<TileGrid/>` does this based on the focused tile's pixel rect
 * (Hyprland's dwindle convention: split along the longer axis so the
 * resulting children stay roughly square).
 */
export function addTile(
  layout: LayoutState,
  kind: WidgetKind,
  options: {
    id?: string;
    splitDir?: 'row' | 'col';
  } = {},
): LayoutState {
  const id = options.id ?? nextTileId();
  const tile: Tile = { id, kind };
  const tiles = { ...layout.tiles, [id]: tile };

  if (!layout.tree) {
    return {
      tiles,
      tree: { type: 'leaf', id },
      focusId: id,
    };
  }

  const targetId =
    (layout.focusId && findPath(layout.tree, layout.focusId)
      ? layout.focusId
      : rightmostLeafId(layout.tree)) ?? null;
  if (!targetId) {
    return {
      tiles,
      tree: { type: 'leaf', id },
      focusId: id,
    };
  }
  const path = findPath(layout.tree, targetId);
  if (!path) {
    return {
      tiles,
      tree: { type: 'leaf', id },
      focusId: id,
    };
  }
  const dir = options.splitDir ?? 'row';
  const split: LayoutNode = {
    type: 'split',
    dir,
    ratio: 0.5,
    a: { type: 'leaf', id: targetId },
    b: { type: 'leaf', id },
  };
  return {
    tiles,
    tree: replaceAt(layout.tree, path, split),
    focusId: id,
  };
}

/**
 * Remove a tile by id. Collapses its parent split back into its sibling.
 * If the removed tile is the last one, the tree becomes null (empty
 * state).
 */
export function removeTile(layout: LayoutState, id: string): LayoutState {
  const tiles = { ...layout.tiles };
  delete tiles[id];

  if (!layout.tree) return { tiles, tree: null, focusId: null };
  const path = findPath(layout.tree, id);
  if (!path) {
    return { ...layout, tiles, focusId: layout.focusId === id ? null : layout.focusId };
  }
  if (path.length === 0) {
    return { tiles, tree: null, focusId: null };
  }
  // Replace parent split with the sibling subtree.
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  const parent = nodeAt(layout.tree, parentPath);
  if (parent.type !== 'split') {
    // Defensive: shouldn't happen given findPath returned a non-empty path.
    return { ...layout, tiles };
  }
  const sibling = last === 'a' ? parent.b : parent.a;
  const tree = replaceAt(layout.tree, parentPath, sibling);
  const newFocus =
    layout.focusId === id || layout.focusId == null || !findPath(tree, layout.focusId)
      ? rightmostLeafId(tree)
      : layout.focusId;
  return { tiles, tree, focusId: newFocus };
}

/**
 * Patch a tile's metadata in place (e.g. `barsHidden`).
 */
export function patchTile(
  layout: LayoutState,
  id: string,
  patch: Partial<Tile>,
): LayoutState {
  const cur = layout.tiles[id];
  if (!cur) return layout;
  return {
    ...layout,
    tiles: { ...layout.tiles, [id]: { ...cur, ...patch } },
  };
}

/** Set the focused tile (used to drive where the next "+ Add" splits). */
export function setFocus(layout: LayoutState, id: string | null): LayoutState {
  if (id == null) return { ...layout, focusId: null };
  if (!layout.tree || !findPath(layout.tree, id)) return layout;
  return { ...layout, focusId: id };
}

/**
 * Swap two leaves' tile ids in the tree. Used by drag-to-rearrange — the
 * user picks up a tile by its header and drops it on a sibling.
 */
export function swapTiles(layout: LayoutState, a: string, b: string): LayoutState {
  if (a === b || !layout.tree) return layout;
  const swap = (n: LayoutNode): LayoutNode => {
    if (n.type === 'leaf') {
      if (n.id === a) return { type: 'leaf', id: b };
      if (n.id === b) return { type: 'leaf', id: a };
      return n;
    }
    return { ...n, a: swap(n.a), b: swap(n.b) };
  };
  return { ...layout, tree: swap(layout.tree) };
}

/** Edge of a target tile a dragged tile can be dropped on to split the
 *  target. Encodes both the resulting split direction (`top`/`bottom`
 *  → `col`, `left`/`right` → `row`) and the ordering of source vs
 *  target inside the new split (source goes first when the edge is
 *  `top`/`left`, second when `bottom`/`right`). */
export type SplitEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * Restructure the tree so that `sourceId` becomes the new neighbour
 * of `targetId` along `edge`. Drag-to-edge UX: moving a tile onto
 * the right edge of another tile produces `[target | source]`,
 * onto the bottom edge produces `[target / source]`, and so on.
 *
 * Implemented as detach-then-insert against the existing primitives:
 *   1. Detach `source` from its current parent split (collapse the
 *      parent into source's sibling — same shape as `removeTile`,
 *      just without dropping `source` from `tiles`).
 *   2. Locate `target` in the now-shrunk tree.
 *   3. Replace the target leaf with a new split whose two children
 *      are `source` + `target` ordered by `edge`, with ratio 0.5.
 *
 * No-ops when the operation can't sensibly produce a different
 * tree (drop on self; source is the root; target was actually
 * source's only sibling and dropping there reproduces the same
 * tree).
 */
export function restructureTile(
  layout: LayoutState,
  sourceId: string,
  targetId: string,
  edge: SplitEdge,
): LayoutState {
  if (sourceId === targetId || !layout.tree) return layout;

  const sourcePath = findPath(layout.tree, sourceId);
  if (!sourcePath || sourcePath.length === 0) return layout;
  const sourceParentPath = sourcePath.slice(0, -1);
  const sourceLastStep = sourcePath[sourcePath.length - 1];
  const sourceParent = nodeAt(layout.tree, sourceParentPath);
  if (sourceParent.type !== 'split') return layout;
  const sourceSibling = sourceLastStep === 'a' ? sourceParent.b : sourceParent.a;
  const detached = replaceAt(layout.tree, sourceParentPath, sourceSibling);

  const targetPath = findPath(detached, targetId);
  if (!targetPath) return layout;

  const dir: 'row' | 'col' = edge === 'left' || edge === 'right' ? 'row' : 'col';
  const sourceFirst = edge === 'top' || edge === 'left';
  const split: LayoutNode = {
    type: 'split',
    dir,
    ratio: 0.5,
    a: sourceFirst
      ? { type: 'leaf', id: sourceId }
      : { type: 'leaf', id: targetId },
    b: sourceFirst
      ? { type: 'leaf', id: targetId }
      : { type: 'leaf', id: sourceId },
  };

  return {
    ...layout,
    tree: replaceAt(detached, targetPath, split),
    focusId: sourceId,
  };
}

/**
 * Update a single split's ratio. The split is identified by the path
 * from the root; the ratio is clamped to [`MIN_RATIO`, `MAX_RATIO`].
 */
export function setRatio(
  layout: LayoutState,
  path: ReadonlyArray<'a' | 'b'>,
  ratio: number,
): LayoutState {
  if (!layout.tree) return layout;
  const clamped = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
  const node = nodeAt(layout.tree, path);
  if (node.type !== 'split') return layout;
  if (node.ratio === clamped) return layout;
  const next = { ...node, ratio: clamped };
  return { ...layout, tree: replaceAt(layout.tree, path, next) };
}

// ---- Pixel layout ----------------------------------------------------------

/**
 * Bounding rect (in dashboard-local pixels) of either a leaf or a split
 * node. The dashboard renderer uses these to absolute-position tiles +
 * resize handles, which keeps every tile mounted as a direct child of
 * `.dash-grid` (no React tree restructure on add/remove/swap, so widget
 * components — and their internal state — survive layout changes).
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LeafLayout {
  id: string;
  rect: Rect;
}

export interface SplitLayout {
  /** `path.join('') || 'root'` — stable across renders. */
  key: string;
  path: Array<'a' | 'b'>;
  dir: 'row' | 'col';
  /** The seam handle's bounding rect. */
  handleRect: Rect;
  /**
   * Length available to the split's two children along the resize axis,
   * excluding the gap consumed by the seam. `ratio = aLen / innerLen`.
   */
  innerLen: number;
}

export interface ComputedLayout {
  leaves: LeafLayout[];
  splits: SplitLayout[];
}

/**
 * Walk the tree and produce absolute-positioned rects for every leaf +
 * a bounding box for every split's seam handle. `outer` is the available
 * area after the dashboard's outer-edge gap is reserved; `gap` is the
 * inter-tile gap (also the seam handle's thickness).
 *
 * Returns empty arrays for `tree === null` or non-positive dimensions
 * (i.e. before the first ResizeObserver fire).
 */
export function computeLayoutRects(
  tree: LayoutNode | null,
  outer: Rect,
  gap: number,
): ComputedLayout {
  const leaves: LeafLayout[] = [];
  const splits: SplitLayout[] = [];
  if (!tree || outer.w <= 0 || outer.h <= 0) return { leaves, splits };

  const walk = (node: LayoutNode, rect: Rect, path: Array<'a' | 'b'>) => {
    if (node.type === 'leaf') {
      leaves.push({ id: node.id, rect });
      return;
    }
    // Pre-order push: outer splits land first in `splits[]` so they
    // render earlier in the DOM. Tests + manual selectors that pick
    // `.dash-split-handle.first()` consistently target the outer-most
    // seam regardless of how deep the tree gets.
    if (node.dir === 'row') {
      const inner = Math.max(0, rect.w - gap);
      const aW = inner * node.ratio;
      const bW = inner - aW;
      splits.push({
        key: path.join('') || 'root',
        path,
        dir: 'row',
        handleRect: { x: rect.x + aW, y: rect.y, w: gap, h: rect.h },
        innerLen: inner,
      });
      walk(node.a, { x: rect.x, y: rect.y, w: aW, h: rect.h }, [...path, 'a']);
      walk(
        node.b,
        { x: rect.x + aW + gap, y: rect.y, w: bW, h: rect.h },
        [...path, 'b'],
      );
    } else {
      const inner = Math.max(0, rect.h - gap);
      const aH = inner * node.ratio;
      const bH = inner - aH;
      splits.push({
        key: path.join('') || 'root',
        path,
        dir: 'col',
        handleRect: { x: rect.x, y: rect.y + aH, w: rect.w, h: gap },
        innerLen: inner,
      });
      walk(node.a, { x: rect.x, y: rect.y, w: rect.w, h: aH }, [...path, 'a']);
      walk(
        node.b,
        { x: rect.x, y: rect.y + aH + gap, w: rect.w, h: bH },
        [...path, 'b'],
      );
    }
  };

  walk(tree, outer, []);
  return { leaves, splits };
}

/**
 * Cycle the eye-button tristate. Widgets without an internal control
 * bar (`hasControlBar === false`) skip the middle "hide controls"
 * state — for them, the cycle is just `show ↔ hideHead`.
 */
export function nextBarMode(
  cur: BarMode | undefined,
  hasControlBar: boolean,
): BarMode {
  const c = cur ?? 'show';
  if (!hasControlBar) return c === 'show' ? 'hideHead' : 'show';
  if (c === 'show') return 'hideBars';
  if (c === 'hideBars') return 'hideHead';
  return 'show';
}
