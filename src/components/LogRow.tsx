// Single log row: rail, pin gutter, ts/pid/pkg/tag/level/message cells, highlights.
//
// TODO(sonnet): port the highlight rendering from design/source/log-row.jsx
// using `highlightRanges` from src/lib/filters.ts. Crash rows render with
// red message color + light red row tint and a "Show stack trace" toggle on
// the first crash line.

import { memo } from 'react';
import type { Filter, LogEntry } from '../types';

export interface LogRowProps {
  entry: LogEntry;
  density: 'compact' | 'cozy' | 'comfortable';
  showTimestamps: boolean;
  showPid: boolean;
  wrapLines: boolean;
  pinned: boolean;
  matches: Filter[];
  onTogglePin: (id: number) => void;
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export const LogRow = memo(function LogRow(props: LogRowProps) {
  const { entry, density, showTimestamps, showPid, wrapLines, pinned, matches, onTogglePin } = props;
  const matched = matches.length > 0;

  const cls = [
    'row',
    matched ? 'match' : '',
    entry.isCrashLine ? 'crash' : '',
    pinned ? 'pinned' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} data-density={density} data-level={entry.level}>
      <span className="row-rail" />
      <button className="row-pin" onClick={() => onTogglePin(entry.id)} title="Pin row">
        ★
      </button>
      {showTimestamps && <span className="cell ts">{formatTs(entry.ts)}</span>}
      {showPid && (
        <span className="cell pid">
          {entry.pid}-{entry.tid}
        </span>
      )}
      <span className="cell pkg">{entry.pkg}</span>
      <span className="cell tag">{entry.tag}</span>
      <span className={`cell level lvl-${entry.level}`}>{entry.level}</span>
      <span className={`cell msg ${wrapLines ? 'wrap' : ''}`}>{entry.message}</span>
    </div>
  );
});
