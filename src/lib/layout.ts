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
 * Default arrangement — mirrors the HANDOFF four-tile layout:
 *
 *   ┌──────────┬─────────────────────────────────┐
 *   │          │                                 │
 *   │  Mirror  │             Logcat              │
 *   │   25%    │             ~60% h              │
 *   │          ├──────────────────┬──────────────┤
 *   │          │      Shell       │   Dumpsys    │
 *   │          │       55%        │     45%      │
 *   └──────────┴──────────────────┴──────────────┘
 *
 * As a tree (`row` = left/right seam, `col` = top/bottom seam):
 *
 *   row(0.25)
 *     ├─ leaf(mirror)
 *     └─ col(0.6)
 *          ├─ leaf(logcat)
 *          └─ row(0.555)
 *                ├─ leaf(shell)
 *                └─ leaf(dumpsys)
 */
export function defaultLayout(): LayoutState {
  const tiles: Record<string, Tile> = {
    w_mirror: { id: 'w_mirror', kind: 'mirror' },
    w_logcat: { id: 'w_logcat', kind: 'logcat' },
    w_shell: { id: 'w_shell', kind: 'shell' },
    w_dumpsys: { id: 'w_dumpsys', kind: 'dumpsys' },
  };
  const tree: LayoutNode = {
    type: 'split',
    dir: 'row',
    ratio: 0.25,
    a: { type: 'leaf', id: 'w_mirror' },
    b: {
      type: 'split',
      dir: 'col',
      ratio: 0.6,
      a: { type: 'leaf', id: 'w_logcat' },
      b: {
        type: 'split',
        dir: 'row',
        ratio: 5 / 9,
        a: { type: 'leaf', id: 'w_shell' },
        b: { type: 'leaf', id: 'w_dumpsys' },
      },
    },
  };
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
    return parsed;
  } catch {
    return defaultLayout();
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
 * focused or the focus is stale, splits the right-most leaf. The split
 * direction defaults to the wider available axis (Hyprland's dwindle
 * default), but callers can pass an explicit `dir`.
 */
export function addTile(
  layout: LayoutState,
  kind: WidgetKind,
  options: {
    id?: string;
    splitDir?: 'row' | 'col';
    /** Rough viewport aspect — used to pick the default split direction. */
    viewportAspect?: number;
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
  const dir =
    options.splitDir ?? ((options.viewportAspect ?? 16 / 9) >= 1 ? 'row' : 'col');
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
