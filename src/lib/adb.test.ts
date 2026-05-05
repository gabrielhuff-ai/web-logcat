// Tests for the threadtime line parser. The rest of lib/adb.ts is the
// WebUSB+ADB transport, which can only be exercised against real
// hardware — see docs/TASKS.md.

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { parseLogcatLine } from './adb';

const FROZEN_NOW = 1_700_000_000_000; // 2023-11-14T22:13:20Z

describe('parseLogcatLine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('parses a typical threadtime line', () => {
    const line = '11-04 12:34:56.789  1234  5678 I MyTag: hello world';
    const entry = parseLogcatLine(line, () => 'com.example');
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({
      pid: 1234,
      tid: 5678,
      pkg: 'com.example',
      tag: 'MyTag',
      level: 'I',
      message: 'hello world',
      ts: FROZEN_NOW, // ingest time, not the parsed timestamp
    });
  });

  it('handles each log level', () => {
    for (const lvl of ['V', 'D', 'I', 'W', 'E'] as const) {
      const entry = parseLogcatLine(
        `11-04 12:34:56.789  1234  5678 ${lvl} Tag: msg`,
        () => 'pkg',
      );
      expect(entry?.level).toBe(lvl);
    }
  });

  it('returns null for non-threadtime lines (logcat banners, blanks)', () => {
    expect(parseLogcatLine('--------- beginning of system', () => 'pkg')).toBeNull();
    expect(parseLogcatLine('', () => 'pkg')).toBeNull();
    expect(parseLogcatLine('garbage', () => 'pkg')).toBeNull();
  });

  it('preserves leading whitespace in messages with multiple spaces', () => {
    // The real logcat output sometimes has whitespace-only messages or
    // messages that start with significant indentation (stack traces).
    const line = '11-04 12:34:56.789  1234  5678 E AndroidRuntime: \tat com.example.foo(Bar.java:42)';
    const entry = parseLogcatLine(line, () => 'pkg');
    expect(entry?.message).toBe('\tat com.example.foo(Bar.java:42)');
  });

  it('uses ingest time, not the parsed timestamp', () => {
    // This is intentional — the threadtime format omits TZ, and device
    // clock skew is common. parseLogcatLine documents this trade-off.
    const line = '01-01 00:00:00.000  1  1 I T: m';
    const a = parseLogcatLine(line, () => 'pkg')!;
    vi.setSystemTime(FROZEN_NOW + 5_000);
    const b = parseLogcatLine(line, () => 'pkg')!;
    expect(b.ts - a.ts).toBe(5_000);
  });

  it('passes the resolved package name through pidToPkg', () => {
    const seen: number[] = [];
    const entry = parseLogcatLine(
      '11-04 12:34:56.789  4242  4242 I T: m',
      (pid) => {
        seen.push(pid);
        return `resolved-for-${pid}`;
      },
    );
    expect(seen).toEqual([4242]);
    expect(entry?.pkg).toBe('resolved-for-4242');
  });

  it('assigns a fresh, monotonic id to each entry', () => {
    const a = parseLogcatLine('11-04 12:34:56.789  1  1 I T: a', () => 'p')!;
    const b = parseLogcatLine('11-04 12:34:56.790  1  1 I T: b', () => 'p')!;
    expect(b.id).toBe(a.id + 1);
  });
});
