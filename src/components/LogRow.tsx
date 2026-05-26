// Single log row + per-field highlight rendering + crash-head toggle.
// Ported from design/v1/source/log-row.jsx.

import { Fragment, memo, useMemo, type ReactNode } from 'react';
import * as Icons from './Icons';
import { formatTs, type TimestampFormat } from '../lib/format';
import type { Filter, LogEntry } from '../types';

interface FieldRange {
  start: number;
  end: number;
  color: number;
}

function highlightField(text: string, value: string, color: number): FieldRange[] {
  if (!value) return [];
  const out: FieldRange[] = [];
  const lower = text.toLowerCase();
  const needle = value.toLowerCase();
  let i = 0;
  while (true) {
    const idx = lower.indexOf(needle, i);
    if (idx < 0) break;
    out.push({ start: idx, end: idx + needle.length, color });
    i = idx + needle.length;
  }
  return out;
}

interface HighlightedTextProps {
  text: string;
  ranges: FieldRange[];
}

function HighlightedText({ text, ranges }: HighlightedTextProps) {
  if (!ranges.length) return <>{text}</>;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: FieldRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      parts.push(<Fragment key={cursor}>{text.slice(cursor, r.start)}</Fragment>);
    }
    parts.push(
      <mark key={r.start} className={`hl hl-c${r.color}`}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) {
    parts.push(<Fragment key={`${cursor}_end`}>{text.slice(cursor)}</Fragment>);
  }
  return <>{parts}</>;
}

export interface LogRowProps {
  entry: LogEntry;
  filters: Filter[];
  tsFormat: TimestampFormat;
  showTimestamps: boolean;
  showPid: boolean;
  showProcess: boolean;
  showTag: boolean;
  showLevel: boolean;
  wrapLines: boolean;
  density: 'compact' | 'cozy' | 'comfortable';
  pinned: boolean;
  onTogglePin: (id: number) => void;
  isMatch: boolean;
  isActiveMatch: boolean;
  isCrashHead: boolean;
  expanded: boolean;
  onToggleExpand: (id: number) => void;
  /** Clicking the row body selects it (mirrors find-next-match). */
  onSelect?: (id: number) => void;
}

export const LogRow = memo(function LogRow({
  entry,
  filters,
  tsFormat,
  showTimestamps,
  showPid,
  showProcess,
  showTag,
  showLevel,
  wrapLines,
  density,
  pinned,
  onTogglePin,
  isMatch,
  isActiveMatch,
  isCrashHead,
  expanded,
  onToggleExpand,
  onSelect,
}: LogRowProps) {
  const msgRanges = useMemo(() => {
    const out: FieldRange[] = [];
    for (const f of filters) {
      if (f.type === 'message') out.push(...highlightField(entry.message, f.value, f.color));
    }
    return out;
  }, [entry.message, filters]);

  const tagRanges = useMemo(() => {
    const out: FieldRange[] = [];
    for (const f of filters) {
      if (f.type === 'tag' || f.type === 'message') {
        out.push(...highlightField(entry.tag, f.value, f.color));
      }
    }
    return out;
  }, [entry.tag, filters]);

  const pkgRanges = useMemo(() => {
    const out: FieldRange[] = [];
    for (const f of filters) {
      if (f.type === 'process' || f.type === 'message') {
        out.push(...highlightField(entry.pkg, f.value, f.color));
      }
    }
    return out;
  }, [entry.pkg, filters]);

  const cls = [
    'row',
    entry.isCrashLine ? 'crash' : '',
    pinned ? 'pinned' : '',
    isMatch ? 'match' : '',
    isActiveMatch ? 'active-match' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      data-level={entry.level}
      data-density={density}
      data-wrap={wrapLines ? 'true' : 'false'}
      onClick={onSelect ? () => onSelect(entry.id) : undefined}
    >
      <div className="row-rail" />
      <button
        className="row-pin"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(entry.id);
        }}
        title={pinned ? 'Unpin' : 'Pin line'}
      >
        {pinned ? <Icons.PinFilled size={11} /> : <Icons.Pin size={11} />}
      </button>
      {showTimestamps && <span className="cell ts">{formatTs(entry.ts, tsFormat)}</span>}
      {showPid && (
        <span className="cell pid">
          {entry.pid}-{entry.tid}
        </span>
      )}
      {showProcess && (
        <span className="cell pkg" title={entry.pkg}>
          <HighlightedText text={entry.pkg} ranges={pkgRanges} />
        </span>
      )}
      {showTag && (
        <span className="cell tag" title={entry.tag}>
          <HighlightedText text={entry.tag} ranges={tagRanges} />
        </span>
      )}
      {showLevel && <span className={`cell level lvl-${entry.level}`}>{entry.level}</span>}
      <span className={`cell msg ${wrapLines ? 'wrap' : ''}`}>
        <HighlightedText text={entry.message} ranges={msgRanges} />
        {isCrashHead && (
          <button
            className="crash-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(entry.id);
            }}
          >
            {expanded ? 'Collapse stack trace' : 'Show stack trace'}
            <Icons.Chevron
              size={11}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 200ms var(--ease-out)',
              }}
            />
          </button>
        )}
      </span>
    </div>
  );
});
