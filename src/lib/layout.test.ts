import { describe, expect, it } from 'vitest';
import {
  MIN_RATIO,
  MAX_RATIO,
  addTile,
  computeLayoutRects,
  countByKind,
  defaultLayout,
  emptyLayout,
  findPath,
  leafIds,
  patchTile,
  removeTile,
  rightmostLeafId,
  setFocus,
  setRatio,
  swapTiles,
} from './layout';
import type { LayoutNode, LayoutState } from '../types';

describe('layout: defaultLayout', () => {
  it('returns four leaves wired through three nested splits', () => {
    const l = defaultLayout();
    expect(Object.keys(l.tiles).sort()).toEqual([
      'w_dumpsys',
      'w_logcat',
      'w_mirror',
      'w_shell',
    ]);
    expect(leafIds(l.tree)).toEqual([
      'w_mirror',
      'w_logcat',
      'w_shell',
      'w_dumpsys',
    ]);
  });

  it('focuses the Logcat tile so the next +Add lands next to it', () => {
    expect(defaultLayout().focusId).toBe('w_logcat');
  });

  it('does not include Files (palette-only per HANDOFF)', () => {
    const kinds = Object.values(defaultLayout().tiles).map((t) => t.kind);
    expect(kinds).not.toContain('files');
  });
});

describe('layout: addTile', () => {
  it('seeds the tree from an empty layout', () => {
    const l = addTile(emptyLayout(), 'logcat', { id: 'a' });
    expect(l.tree).toEqual({ type: 'leaf', id: 'a' });
    expect(l.focusId).toBe('a');
    expect(l.tiles.a.kind).toBe('logcat');
  });

  it('splits the focused leaf and re-focuses on the new tile', () => {
    const seed = addTile(emptyLayout(), 'logcat', { id: 'a' });
    const next = addTile(seed, 'shell', { id: 'b', splitDir: 'row' });
    expect(next.focusId).toBe('b');
    expect(next.tree).toEqual({
      type: 'split',
      dir: 'row',
      ratio: 0.5,
      a: { type: 'leaf', id: 'a' },
      b: { type: 'leaf', id: 'b' },
    });
  });

  it('falls back to the rightmost leaf when focus is stale', () => {
    let l: LayoutState = addTile(emptyLayout(), 'logcat', { id: 'a' });
    l = addTile(l, 'shell', { id: 'b', splitDir: 'row' });
    // Wipe the focus.
    l = setFocus(l, null);
    const next = addTile(l, 'dumpsys', { id: 'c', splitDir: 'col' });
    // Rightmost leaf is `b`, so the new split nests under the right child.
    if (next.tree?.type !== 'split' || next.tree.b.type !== 'split') {
      throw new Error('expected b to become a split');
    }
    expect(next.tree.b).toMatchObject({
      type: 'split',
      dir: 'col',
      a: { type: 'leaf', id: 'b' },
      b: { type: 'leaf', id: 'c' },
    });
  });

  it('respects an explicit splitDir option', () => {
    const seed = addTile(emptyLayout(), 'logcat', { id: 'a' });
    const wide = addTile(seed, 'shell', { id: 'b', splitDir: 'row' });
    const tall = addTile(seed, 'shell', { id: 'b', splitDir: 'col' });
    expect(wide.tree?.type === 'split' && wide.tree.dir).toBe('row');
    expect(tall.tree?.type === 'split' && tall.tree.dir).toBe('col');
  });

  it('defaults to a row split when no direction is specified', () => {
    const seed = addTile(emptyLayout(), 'logcat', { id: 'a' });
    const next = addTile(seed, 'shell', { id: 'b' });
    expect(next.tree?.type === 'split' && next.tree.dir).toBe('row');
  });
});

describe('layout: removeTile', () => {
  it('drops the tile entry and collapses the parent split into the sibling', () => {
    let l: LayoutState = addTile(emptyLayout(), 'logcat', { id: 'a' });
    l = addTile(l, 'shell', { id: 'b' });
    const next = removeTile(l, 'a');
    expect(next.tree).toEqual({ type: 'leaf', id: 'b' });
    expect(next.tiles.a).toBeUndefined();
  });

  it('returns to the empty state when the last tile is removed', () => {
    const l = addTile(emptyLayout(), 'logcat', { id: 'a' });
    const next = removeTile(l, 'a');
    expect(next.tree).toBeNull();
    expect(next.focusId).toBeNull();
    expect(Object.keys(next.tiles)).toHaveLength(0);
  });

  it('moves focus to the rightmost leaf when the focused tile is removed', () => {
    let l: LayoutState = addTile(emptyLayout(), 'logcat', { id: 'a' });
    l = addTile(l, 'shell', { id: 'b' });
    l = setFocus(l, 'a');
    const next = removeTile(l, 'a');
    expect(next.focusId).toBe('b');
  });
});

describe('layout: setRatio', () => {
  it('clamps to MIN_RATIO / MAX_RATIO', () => {
    let l: LayoutState = addTile(emptyLayout(), 'logcat', { id: 'a' });
    l = addTile(l, 'shell', { id: 'b' });
    const lo = setRatio(l, [], -1);
    const hi = setRatio(l, [], 5);
    expect((lo.tree as Extract<LayoutNode, { type: 'split' }>).ratio).toBe(MIN_RATIO);
    expect((hi.tree as Extract<LayoutNode, { type: 'split' }>).ratio).toBe(MAX_RATIO);
  });

  it('updates a nested split addressed by path', () => {
    const l = defaultLayout();
    // root.b.b is the row split holding shell + dumpsys.
    const next = setRatio(l, ['b', 'b'], 0.3);
    const root = next.tree as Extract<LayoutNode, { type: 'split' }>;
    const mid = root.b as Extract<LayoutNode, { type: 'split' }>;
    const inner = mid.b as Extract<LayoutNode, { type: 'split' }>;
    expect(inner.ratio).toBeCloseTo(0.3, 5);
  });
});

describe('layout: swapTiles', () => {
  it('exchanges two leaf ids in place', () => {
    const l = defaultLayout();
    const next = swapTiles(l, 'w_mirror', 'w_dumpsys');
    expect(leafIds(next.tree)).toEqual([
      'w_dumpsys',
      'w_logcat',
      'w_shell',
      'w_mirror',
    ]);
  });
});

describe('layout: helpers', () => {
  it('findPath traverses through nested splits', () => {
    const l = defaultLayout();
    expect(findPath(l.tree, 'w_mirror')).toEqual(['a']);
    expect(findPath(l.tree, 'w_logcat')).toEqual(['b', 'a']);
    expect(findPath(l.tree, 'w_dumpsys')).toEqual(['b', 'b', 'b']);
  });

  it('rightmostLeafId follows .b to the deepest leaf', () => {
    expect(rightmostLeafId(defaultLayout().tree)).toBe('w_dumpsys');
  });

  it('countByKind tallies tiles by their kind discriminator', () => {
    const l = defaultLayout();
    expect(countByKind(l, 'mirror')).toBe(1);
    expect(countByKind(l, 'files')).toBe(0);
  });

  it('patchTile applies a partial update to one tile', () => {
    const l = defaultLayout();
    const next = patchTile(l, 'w_logcat', { barsHidden: true });
    expect(next.tiles.w_logcat.barsHidden).toBe(true);
    expect(next.tiles.w_mirror.barsHidden).toBeUndefined();
  });
});

describe('layout: computeLayoutRects', () => {
  it('returns empty arrays for a null tree', () => {
    const out = computeLayoutRects(null, { x: 0, y: 0, w: 1000, h: 600 }, 10);
    expect(out.leaves).toEqual([]);
    expect(out.splits).toEqual([]);
  });

  it('places a single leaf at the outer rect', () => {
    const tree: LayoutNode = { type: 'leaf', id: 'a' };
    const out = computeLayoutRects(tree, { x: 10, y: 10, w: 800, h: 400 }, 10);
    expect(out.leaves).toEqual([{ id: 'a', rect: { x: 10, y: 10, w: 800, h: 400 } }]);
    expect(out.splits).toEqual([]);
  });

  it('subtracts gap from the inner length on a row split', () => {
    const tree: LayoutNode = {
      type: 'split',
      dir: 'row',
      ratio: 0.5,
      a: { type: 'leaf', id: 'a' },
      b: { type: 'leaf', id: 'b' },
    };
    const out = computeLayoutRects(tree, { x: 0, y: 0, w: 410, h: 100 }, 10);
    // inner = 410 - 10 = 400; each child = 200 wide.
    expect(out.leaves).toEqual([
      { id: 'a', rect: { x: 0, y: 0, w: 200, h: 100 } },
      { id: 'b', rect: { x: 210, y: 0, w: 200, h: 100 } },
    ]);
    // Seam handle sits between them, 10px wide, full height.
    expect(out.splits).toHaveLength(1);
    expect(out.splits[0]).toMatchObject({
      dir: 'row',
      handleRect: { x: 200, y: 0, w: 10, h: 100 },
      innerLen: 400,
    });
  });

  it('lays out a col split top-over-bottom', () => {
    const tree: LayoutNode = {
      type: 'split',
      dir: 'col',
      ratio: 0.25,
      a: { type: 'leaf', id: 'a' },
      b: { type: 'leaf', id: 'b' },
    };
    const out = computeLayoutRects(tree, { x: 0, y: 0, w: 200, h: 410 }, 10);
    // inner = 410 - 10 = 400; a = 100, b = 300.
    expect(out.leaves).toEqual([
      { id: 'a', rect: { x: 0, y: 0, w: 200, h: 100 } },
      { id: 'b', rect: { x: 0, y: 110, w: 200, h: 300 } },
    ]);
    expect(out.splits[0]).toMatchObject({
      dir: 'col',
      handleRect: { x: 0, y: 100, w: 200, h: 10 },
    });
  });
});
