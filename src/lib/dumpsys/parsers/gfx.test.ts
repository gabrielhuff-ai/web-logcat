import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGfxinfo } from './gfx';

const FIXTURE = readFileSync(
  resolve(__dirname, '../__fixtures__/gfx.txt'),
  'utf8',
);

describe('parseGfxinfo', () => {
  it('decodes the captured fixture', () => {
    const out = parseGfxinfo(FIXTURE);
    expect(out.pkg).toBe('com.example.shopapp');
    expect(out.pid).toBe(8412);
    expect(out.totalFrames).toBe(18420);
    expect(out.jankyFrames).toBe(380);
    expect(out.jankyPct).toBeCloseTo(2.06, 2);
    expect(out.p50).toBe(7);
    expect(out.p90).toBe(12);
    expect(out.p95).toBe(18);
    expect(out.p99).toBe(32);
    expect(out.missedVsync).toBe(18);
    expect(out.slowUiThread).toBe(22);
  });

  it('decodes the histogram, sorted ascending by ms', () => {
    const out = parseGfxinfo(FIXTURE);
    expect(out.histogram.length).toBeGreaterThan(10);
    expect(out.histogram[0]).toEqual({ ms: 5, count: 120 });
    for (let i = 1; i < out.histogram.length; i += 1) {
      expect(out.histogram[i].ms).toBeGreaterThan(out.histogram[i - 1].ms);
    }
  });

  it('returns nulls for missing fields', () => {
    const out = parseGfxinfo('Total frames rendered: 100\n');
    expect(out.totalFrames).toBe(100);
    expect(out.jankyFrames).toBeNull();
    expect(out.p50).toBeNull();
    expect(out.histogram).toHaveLength(0);
  });
});
