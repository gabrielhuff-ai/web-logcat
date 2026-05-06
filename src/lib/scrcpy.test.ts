// Vitest coverage for the small pure helpers in `lib/scrcpySim.ts`.
//
// The actual scrcpy session (`lib/scrcpy.ts`) sits on top of WebUSB +
// WebCodecs and is intentionally *not* tested in headless CI — those
// APIs aren't available in jsdom and the only meaningful integration
// happens against a real Pixel/Galaxy. Mirroring the convention from
// `lib/filters.test.ts` and `lib/shellSim.test.ts`: pure logic gets
// exercised here; transport stays manual.

import { describe, expect, it } from 'vitest';
import { formatRecordTime, formatStatusClock, stepTaps } from './scrcpySim';

describe('scrcpySim: formatRecordTime', () => {
  it('zero-pads minutes and seconds', () => {
    expect(formatRecordTime(0)).toBe('00:00');
    expect(formatRecordTime(7)).toBe('00:07');
    expect(formatRecordTime(65)).toBe('01:05');
  });

  it('handles ten-minute boundaries', () => {
    expect(formatRecordTime(10 * 60)).toBe('10:00');
    expect(formatRecordTime(60 * 60 + 1)).toBe('60:01');
  });
});

describe('scrcpySim: formatStatusClock', () => {
  it('zero-pads hours and minutes', () => {
    const d = new Date('2025-01-01T03:07:00');
    expect(formatStatusClock(d)).toBe('03:07');
  });
});

describe('scrcpySim: stepTaps', () => {
  it('grows radius and decays opacity each tick', () => {
    const taps = [{ id: 1, x: 100, y: 100, r: 8, op: 0.9 }];
    const next = stepTaps(taps);
    expect(next).toHaveLength(1);
    expect(next[0].r).toBeCloseTo(10.5);
    expect(next[0].op).toBeCloseTo(0.85);
  });

  it('drops fully-faded taps', () => {
    const taps = [
      { id: 1, x: 0, y: 0, r: 10, op: 0.04 },
      { id: 2, x: 0, y: 0, r: 10, op: 0.5 },
    ];
    const next = stepTaps(taps);
    expect(next.map((t) => t.id)).toEqual([2]);
  });
});
