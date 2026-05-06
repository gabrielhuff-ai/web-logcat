// Filter chip parsing + matching for WebLogcat.
//
// A filter is { id, type, value, color }.
//   - type: one of "process" | "tag" | "pid" | "level" | "message"
//   - value: user-entered string after the colon (or raw text → message)
//   - color: 1..palette (cycled)
//
// Filters do NOT hide rows by default — they highlight matching parts.
// "Show only matches" mode hides rows that match no filter.
//
// Ported 1:1 from design/v1/source/filters.jsx with TypeScript types.

import type { Filter, FilterType, HighlightRange, LogEntry } from '../types';

export const FILTER_TYPES: readonly FilterType[] = [
  'process',
  'tag',
  'pid',
  'level',
  'message',
] as const;

interface ParsedFilter {
  type: FilterType;
  value: string;
}

export function parseFilter(input: string): ParsedFilter | null {
  const raw = input.trim();
  if (!raw) return null;
  const colon = raw.indexOf(':');
  if (colon > -1) {
    const type = raw.slice(0, colon).toLowerCase();
    const value = raw.slice(colon + 1).trim();
    if ((FILTER_TYPES as readonly string[]).includes(type) && value) {
      return { type: type as FilterType, value };
    }
  }
  return { type: 'message', value: raw };
}

let _fid = 0;
export function makeFilter(input: string, palette = 6): Filter | null {
  const parsed = parseFilter(input);
  if (!parsed) return null;
  _fid += 1;
  return {
    id: _fid,
    type: parsed.type,
    value: parsed.value,
    color: ((_fid - 1) % palette) + 1,
  };
}

export function entryMatchesFilter(entry: LogEntry, f: Filter): boolean {
  if (!f || !f.value) return false;
  const v = f.value.toLowerCase();
  switch (f.type) {
    case 'process':
      return entry.pkg.toLowerCase().includes(v);
    case 'tag':
      return entry.tag.toLowerCase().includes(v);
    case 'pid':
      return String(entry.pid) === f.value || String(entry.tid) === f.value;
    case 'level':
      return entry.level.toLowerCase() === v[0];
    case 'message':
    default:
      return (
        entry.message.toLowerCase().includes(v) ||
        entry.tag.toLowerCase().includes(v) ||
        entry.pkg.toLowerCase().includes(v)
      );
  }
}

/** Returns the subset of `filters` that match this entry. */
export function entryMatches(entry: LogEntry, filters: readonly Filter[]): Filter[] {
  const matched: Filter[] = [];
  for (const f of filters) {
    if (entryMatchesFilter(entry, f)) matched.push(f);
  }
  return matched;
}

/**
 * Highlight ranges in the message text for a single entry given filters.
 * Returns sorted, non-overlapping ranges (last-one-wins on overlap).
 */
export function highlightRanges(text: string, filters: readonly Filter[]): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  for (const f of filters) {
    if (f.type !== 'message') continue;
    const v = f.value;
    if (!v) continue;
    const lower = text.toLowerCase();
    const needle = v.toLowerCase();
    let i = 0;
    while (true) {
      const idx = lower.indexOf(needle, i);
      if (idx < 0) break;
      ranges.push({ start: idx, end: idx + needle.length, color: f.color });
      i = idx + needle.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/** Test-only: reset the monotonic filter id counter. */
export function __resetFilterIdsForTests(): void {
  _fid = 0;
}
