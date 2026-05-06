import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMeminfo } from './memory';

const FIXTURE = readFileSync(
  resolve(__dirname, '../__fixtures__/memory.txt'),
  'utf8',
);

describe('parseMeminfo', () => {
  it('decodes the captured fixture', () => {
    const out = parseMeminfo(FIXTURE);
    expect(out.pid).toBe(982);
    expect(out.pkg).toBe('system_server');
    expect(out.totalPssKb).toBe(136994);
    expect(out.privateDirtyKb).toBe(100360);
    expect(out.javaHeapKb).toBe(32140);
    expect(out.nativeHeapKb).toBe(52000);
    expect(out.codeKb).toBe(30260);
    expect(out.stackKb).toBe(2480);
    expect(out.totalRamKb).toBe(11924000);
    expect(out.freeRamKb).toBe(4202440);
    expect(out.usedRamKb).toBe(7610212);
  });

  it('returns the top-PSS process list sorted desc', () => {
    const out = parseMeminfo(FIXTURE);
    expect(out.procs[0].pkg).toBe('system_server');
    expect(out.procs[0].kb).toBe(312508);
    expect(out.procs[0].pid).toBe(982);
    // Sorted descending.
    for (let i = 1; i < out.procs.length; i += 1) {
      expect(out.procs[i].kb).toBeLessThanOrEqual(out.procs[i - 1].kb);
    }
  });

  it('handles a dump with no per-process block', () => {
    const out = parseMeminfo('Total RAM: 8,000,000K\n Free RAM: 2,000,000K\n');
    expect(out.pid).toBeNull();
    expect(out.pkg).toBeNull();
    expect(out.procs).toHaveLength(0);
    expect(out.totalRamKb).toBe(8000000);
    expect(out.freeRamKb).toBe(2000000);
  });

  it('parses the Android-13+ "kB" footer (no commas, space before unit)', () => {
    const out = parseMeminfo(
      'Total RAM:    11924036 kB (status normal)\n' +
        ' Free RAM:    4202440 kB\n' +
        ' Used RAM:    7610212 kB\n',
    );
    expect(out.totalRamKb).toBe(11924036);
    expect(out.freeRamKb).toBe(4202440);
    expect(out.usedRamKb).toBe(7610212);
  });
});
