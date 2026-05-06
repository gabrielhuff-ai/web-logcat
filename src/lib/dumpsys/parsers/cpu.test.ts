import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCpuinfo } from './cpu';

const FIXTURE = readFileSync(
  resolve(__dirname, '../__fixtures__/cpu.txt'),
  'utf8',
);

describe('parseCpuinfo', () => {
  it('decodes load averages', () => {
    const out = parseCpuinfo(FIXTURE);
    expect(out.load).toEqual({ one: 1.42, five: 1.18, fifteen: 0.92 });
  });

  it('decodes the per-process list, sorted desc', () => {
    const out = parseCpuinfo(FIXTURE);
    expect(out.procs[0]).toMatchObject({
      pct: 18,
      pid: 8412,
      pkg: 'com.example.shopapp',
      user: 14,
      kernel: 4,
    });
    for (let i = 1; i < out.procs.length; i += 1) {
      expect(out.procs[i].pct).toBeLessThanOrEqual(out.procs[i - 1].pct);
    }
  });

  it('decodes the TOTAL aggregate line', () => {
    const out = parseCpuinfo(FIXTURE);
    expect(out.total).toEqual({
      pct: 56,
      user: 38,
      kernel: 14,
      iowait: 3,
      softirq: 1,
    });
  });

  it('decodes the per-core breakdown', () => {
    const out = parseCpuinfo(FIXTURE);
    expect(out.cores).toHaveLength(8);
    expect(out.cores[0]).toMatchObject({
      id: 0,
      user: 62,
      nice: 18,
      sys: 5,
      idle: 10,
    });
    expect(out.cores[7].id).toBe(7);
  });

  it('returns nulls / empties for an empty input', () => {
    const out = parseCpuinfo('');
    expect(out.load).toBeNull();
    expect(out.total).toBeNull();
    expect(out.procs).toHaveLength(0);
    expect(out.cores).toHaveLength(0);
  });
});
