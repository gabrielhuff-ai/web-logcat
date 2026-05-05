// Pure-logic tests for filter parsing, matching, and highlighting.

import { describe, expect, it, beforeEach } from 'vitest';
import {
  FILTER_TYPES,
  __resetFilterIdsForTests,
  entryMatches,
  entryMatchesFilter,
  highlightRanges,
  makeFilter,
  parseFilter,
} from './filters';
import type { Filter, LogEntry } from '../types';

const ENTRY: LogEntry = {
  id: 1,
  ts: 1_700_000_000_000,
  pid: 1234,
  tid: 5678,
  pkg: 'com.example.shopapp',
  tag: 'CartViewModel',
  level: 'I',
  message: 'Subtotal recomputed: $42.99, items=3',
};

describe('parseFilter', () => {
  it('returns null for empty input', () => {
    expect(parseFilter('')).toBeNull();
    expect(parseFilter('   ')).toBeNull();
  });

  it('treats unprefixed text as a message filter', () => {
    expect(parseFilter('hello')).toEqual({ type: 'message', value: 'hello' });
  });

  it('strips whitespace around the value', () => {
    expect(parseFilter('  tag:Foo  ')).toEqual({ type: 'tag', value: 'Foo' });
  });

  it('parses each known type prefix case-insensitively', () => {
    for (const t of FILTER_TYPES) {
      expect(parseFilter(`${t.toUpperCase()}:abc`)).toEqual({ type: t, value: 'abc' });
    }
  });

  it('falls back to message for an unknown prefix', () => {
    expect(parseFilter('weird:thing')).toEqual({ type: 'message', value: 'weird:thing' });
  });

  it('falls back to a message filter when the value after `:` is empty', () => {
    // "tag:" has no value, so it's not a valid typed filter; the parser
    // degrades it to a message filter over the literal string instead of
    // rejecting outright (lets the user keep typing without losing draft).
    expect(parseFilter('tag:')).toEqual({ type: 'message', value: 'tag:' });
  });
});

describe('makeFilter', () => {
  beforeEach(() => __resetFilterIdsForTests());

  it('assigns sequential ids and cycles colors through the palette', () => {
    const a = makeFilter('tag:Foo', 3);
    const b = makeFilter('tag:Bar', 3);
    const c = makeFilter('tag:Baz', 3);
    const d = makeFilter('tag:Qux', 3);
    expect(a?.id).toBe(1);
    expect(b?.id).toBe(2);
    expect(c?.id).toBe(3);
    expect(d?.id).toBe(4);
    expect(a?.color).toBe(1);
    expect(b?.color).toBe(2);
    expect(c?.color).toBe(3);
    expect(d?.color).toBe(1); // cycled
  });
});

describe('entryMatchesFilter', () => {
  const f = (type: Filter['type'], value: string): Filter => ({
    id: 0,
    type,
    value,
    color: 1,
  });

  it('process: matches package substring (case-insensitive)', () => {
    expect(entryMatchesFilter(ENTRY, f('process', 'shopapp'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('process', 'SHOPAPP'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('process', 'systemui'))).toBe(false);
  });

  it('tag: matches tag substring', () => {
    expect(entryMatchesFilter(ENTRY, f('tag', 'View'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('tag', 'StatusBar'))).toBe(false);
  });

  it('pid: matches the exact pid or tid string', () => {
    expect(entryMatchesFilter(ENTRY, f('pid', '1234'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('pid', '5678'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('pid', '123'))).toBe(false);
  });

  it('level: matches the first character (case-insensitive)', () => {
    expect(entryMatchesFilter(ENTRY, f('level', 'i'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('level', 'I'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('level', 'info'))).toBe(true);
    expect(entryMatchesFilter(ENTRY, f('level', 'e'))).toBe(false);
  });

  it('message: searches across message, tag, and pkg', () => {
    expect(entryMatchesFilter(ENTRY, f('message', 'subtotal'))).toBe(true); // in message
    expect(entryMatchesFilter(ENTRY, f('message', 'Cart'))).toBe(true); // in tag
    expect(entryMatchesFilter(ENTRY, f('message', 'shopapp'))).toBe(true); // in pkg
    expect(entryMatchesFilter(ENTRY, f('message', 'nope'))).toBe(false);
  });
});

describe('entryMatches', () => {
  it('returns the subset of filters that match', () => {
    const fs: Filter[] = [
      { id: 1, type: 'tag', value: 'View', color: 1 },
      { id: 2, type: 'tag', value: 'StatusBar', color: 2 },
      { id: 3, type: 'process', value: 'shopapp', color: 3 },
    ];
    const matched = entryMatches(ENTRY, fs);
    expect(matched.map((f) => f.id)).toEqual([1, 3]);
  });

  it('returns an empty array when no filter matches', () => {
    expect(entryMatches(ENTRY, [{ id: 1, type: 'tag', value: 'NoMatch', color: 1 }])).toEqual(
      [],
    );
  });
});

describe('highlightRanges', () => {
  it('returns ranges for each non-overlapping match of a message filter', () => {
    const fs: Filter[] = [{ id: 1, type: 'message', value: 'lo', color: 1 }];
    // "hello world hollow" — "lo" at positions 3 ('hel|lo|') and 15
    // ('hol|lo|w'). The 'l' at index 9 is followed by 'd', not 'o'.
    expect(highlightRanges('hello world hollow', fs)).toEqual([
      { start: 3, end: 5, color: 1 },
      { start: 15, end: 17, color: 1 },
    ]);
  });

  it('ignores non-message filters', () => {
    const fs: Filter[] = [{ id: 1, type: 'tag', value: 'lo', color: 1 }];
    expect(highlightRanges('hello world', fs)).toEqual([]);
  });

  it('merges overlapping ranges into a single range', () => {
    const fs: Filter[] = [
      { id: 1, type: 'message', value: 'hello', color: 1 },
      { id: 2, type: 'message', value: 'lo wo', color: 2 },
    ];
    // 'hello world' — 'hello' = [0,5), 'lo wo' = [3,8). They overlap, merge to [0,8).
    const out = highlightRanges('hello world', fs);
    expect(out).toEqual([{ start: 0, end: 8, color: 1 }]);
  });
});
