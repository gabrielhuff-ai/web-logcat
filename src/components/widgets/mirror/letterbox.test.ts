import { describe, expect, it } from 'vitest';
import { contentFrac } from './letterbox';

// Helper: build a DOMRect-shaped object with `left` / `top` defaulting
// to 0 so test cases focus on what matters (sizes + offsets).
const rect = (width: number, height: number, left = 0, top = 0) => ({
  left,
  top,
  width,
  height,
});

describe('contentFrac: aspect match', () => {
  it('maps the centre to (0.5, 0.5) when container matches source aspect', () => {
    const f = contentFrac(rect(800, 600), 400, 300, 1600, 1200);
    expect(f.fracX).toBeCloseTo(0.5);
    expect(f.fracY).toBeCloseTo(0.5);
  });

  it('maps the top-left corner to (0, 0)', () => {
    const f = contentFrac(rect(800, 600), 0, 0, 1600, 1200);
    expect(f.fracX).toBeCloseTo(0);
    expect(f.fracY).toBeCloseTo(0);
  });
});

describe('contentFrac: container wider than source (left/right letterbox)', () => {
  // 800×600 container (4:3), 1080×1920 source (portrait 9:16).
  // Source displays as 337.5×600, gutters of (800 - 337.5)/2 = 231.25 px.
  const containerRect = rect(800, 600);
  const SRC_W = 1080;
  const SRC_H = 1920;

  it('maps a centre tap to (0.5, 0.5)', () => {
    const f = contentFrac(containerRect, 400, 300, SRC_W, SRC_H);
    expect(f.fracX).toBeCloseTo(0.5);
    expect(f.fracY).toBeCloseTo(0.5);
  });

  it('maps the left edge of the displayed video to fracX≈0', () => {
    // Left edge of video sits at x=231.25 in container coords.
    const f = contentFrac(containerRect, 231.25, 300, SRC_W, SRC_H);
    expect(f.fracX).toBeCloseTo(0);
  });

  it('maps the right edge of the displayed video to fracX≈1', () => {
    const f = contentFrac(containerRect, 568.75, 300, SRC_W, SRC_H);
    expect(f.fracX).toBeCloseTo(1);
  });

  it('returns negative fracX inside the left letterbox', () => {
    const f = contentFrac(containerRect, 100, 300, SRC_W, SRC_H);
    expect(f.fracX).toBeLessThan(0);
  });
});

describe('contentFrac: container taller than source (top/bottom letterbox)', () => {
  // 800×600 container (4:3), 1920×1080 source (landscape 16:9).
  // Source displays as 800×450, gutters of (600 - 450)/2 = 75 px.
  const containerRect = rect(800, 600);
  const SRC_W = 1920;
  const SRC_H = 1080;

  it('maps a centre tap to (0.5, 0.5)', () => {
    const f = contentFrac(containerRect, 400, 300, SRC_W, SRC_H);
    expect(f.fracX).toBeCloseTo(0.5);
    expect(f.fracY).toBeCloseTo(0.5);
  });

  it('maps the top edge of the displayed video to fracY≈0', () => {
    const f = contentFrac(containerRect, 400, 75, SRC_W, SRC_H);
    expect(f.fracY).toBeCloseTo(0);
  });

  it('maps the bottom edge of the displayed video to fracY≈1', () => {
    const f = contentFrac(containerRect, 400, 525, SRC_W, SRC_H);
    expect(f.fracY).toBeCloseTo(1);
  });

  it('does not stretch — a click halfway up the visible video maps near 0.25', () => {
    // The bug this guards against: previously a click halfway between
    // the letterbox-top and the centre mapped to fracY=0.25 of the
    // container, which is the *letterbox itself* — not 0.25 of the
    // visible video. With letterbox-aware mapping the same click maps
    // to fracY≈0.25 of the video, i.e. a quarter down from the top of
    // the actually-visible content.
    //
    // Halfway between letterbox top (y=75) and centre (y=300) is
    // y=187.5. That's a quarter down the visible video (0..450 with
    // 75 offset → relative y=112.5, frac=112.5/450=0.25).
    const f = contentFrac(containerRect, 400, 187.5, SRC_W, SRC_H);
    expect(f.fracY).toBeCloseTo(0.25);
  });
});

describe('contentFrac: rect offsets are respected', () => {
  it('accounts for non-zero rect left/top', () => {
    // 800×600 container at (100, 200), 1600×1200 source — aspects match
    // so the displayed rect is the container.
    const f = contentFrac(rect(800, 600, 100, 200), 500, 500, 1600, 1200);
    expect(f.fracX).toBeCloseTo(0.5);
    expect(f.fracY).toBeCloseTo(0.5);
  });
});

describe('contentFrac: degenerate inputs fall back gracefully', () => {
  it('falls back to container-rect math when source size is 0', () => {
    const f = contentFrac(rect(800, 600), 400, 300, 0, 0);
    expect(f.fracX).toBeCloseTo(0.5);
    expect(f.fracY).toBeCloseTo(0.5);
  });

  it('returns 0 fractions when the rect has no extent', () => {
    const f = contentFrac(rect(0, 0), 100, 100, 1080, 1920);
    expect(f.fracX).toBe(0);
    expect(f.fracY).toBe(0);
  });
});
