import { describe, expect, it } from 'vitest';
import {
  COLS,
  GAP,
  MIN_H,
  MIN_W,
  PHASE_6_DEFAULT_LAYOUT,
  ROW_PX,
  colWidth,
  placeBelow,
  snapMove,
  snapResize,
  totalRows,
} from './layout';

describe('layout: colWidth', () => {
  it('subtracts gaps before dividing', () => {
    // 12 cols, 11 gaps × 10px = 110px of gap
    const total = 12 * 100 + 11 * GAP;
    expect(colWidth(total)).toBeCloseTo(100, 5);
  });
});

describe('layout: snapMove', () => {
  const cw = 100;
  const origin = { x: 2, y: 1, w: 4 };

  it('snaps a one-column move', () => {
    // dx of one (cw + gap) → dCol = 1
    const r = snapMove(origin, cw + GAP, 0, cw);
    expect(r).toEqual({ x: 3, y: 1 });
  });

  it('snaps a one-row move', () => {
    const r = snapMove(origin, 0, ROW_PX + GAP, cw);
    expect(r).toEqual({ x: 2, y: 2 });
  });

  it('clamps the right edge to keep the tile in-bounds', () => {
    // Try to move 50 columns to the right — must clamp at COLS - w
    const r = snapMove(origin, 5000, 0, cw);
    expect(r.x).toBe(COLS - origin.w);
  });

  it('clamps the left edge at 0', () => {
    const r = snapMove(origin, -5000, 0, cw);
    expect(r.x).toBe(0);
  });

  it('clamps the top edge at 0 (no negative rows)', () => {
    const r = snapMove(origin, 0, -5000, cw);
    expect(r.y).toBe(0);
  });

  it('does not cap the bottom edge — grid grows downward', () => {
    const r = snapMove(origin, 0, (ROW_PX + GAP) * 50, cw);
    expect(r.y).toBe(origin.y + 50);
  });
});

describe('layout: snapResize', () => {
  const cw = 100;
  const origin = { x: 2, w: 4, h: 4 };

  it('grows the tile right by one column', () => {
    const r = snapResize(origin, cw + GAP, 0, cw);
    expect(r).toEqual({ w: 5, h: 4 });
  });

  it('clamps width at MIN_W', () => {
    const r = snapResize(origin, -(cw + GAP) * 50, 0, cw);
    expect(r.w).toBe(MIN_W);
  });

  it('clamps width to the right edge of the grid', () => {
    const r = snapResize(origin, (cw + GAP) * 50, 0, cw);
    expect(r.w).toBe(COLS - origin.x);
  });

  it('clamps height at MIN_H', () => {
    const r = snapResize(origin, 0, -(ROW_PX + GAP) * 50, cw);
    expect(r.h).toBe(MIN_H);
  });
});

describe('layout: placeBelow', () => {
  it('returns the next y after the lowest tile bottom', () => {
    const layout = [
      { id: 'a', kind: 'logcat' as const, x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', kind: 'logcat' as const, x: 6, y: 0, w: 6, h: 6 },
    ];
    const r = placeBelow(layout, 4);
    expect(r).toEqual({ x: 0, y: 6 });
  });

  it('returns y=0 for an empty layout', () => {
    expect(placeBelow([], 4)).toEqual({ x: 0, y: 0 });
  });
});

describe('layout: totalRows', () => {
  it('honours the minimum', () => {
    expect(totalRows([], 12)).toBe(12);
  });
  it('grows past the minimum to fit a tall tile', () => {
    expect(
      totalRows(
        [{ id: 'a', kind: 'logcat', x: 0, y: 0, w: 12, h: 20 }],
        12,
      ),
    ).toBe(20);
  });
});

describe('layout: PHASE_6_DEFAULT_LAYOUT', () => {
  it('places a full-width Logcat tile on top', () => {
    const logcat = PHASE_6_DEFAULT_LAYOUT.find((t) => t.kind === 'logcat');
    expect(logcat).toBeDefined();
    expect(logcat!.x).toBe(0);
    expect(logcat!.y).toBe(0);
    expect(logcat!.w).toBe(COLS);
  });

  it('places a Shell tile directly below the Logcat tile', () => {
    const logcat = PHASE_6_DEFAULT_LAYOUT.find((t) => t.kind === 'logcat')!;
    const shell = PHASE_6_DEFAULT_LAYOUT.find((t) => t.kind === 'shell');
    expect(shell).toBeDefined();
    expect(shell!.y).toBe(logcat.y + logcat.h);
    expect(shell!.w).toBe(5);
    expect(shell!.h).toBe(4);
  });

  it('contains no tiles for kinds whose widget has not shipped yet', () => {
    const kinds = PHASE_6_DEFAULT_LAYOUT.map((t) => t.kind).sort();
    expect(kinds).toEqual(['logcat', 'shell']);
  });
});
