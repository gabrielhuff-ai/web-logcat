// Scrollable log area with pinned sticky block.
//
// TODO(sonnet): once log rates exceed ~500/s the naive rendering here will
// stutter. Swap in `@tanstack/react-virtual` (or react-window). The pinned
// block stays outside the virtualised range — sticky, top of scroll region.
//
// TODO(sonnet): track scroll-up to disengage auto-scroll and surface the
// "Resume tail" pill (positioned bottom-right; class `.scroll-to-bottom`
// in app.css).

import { useEffect, useRef } from 'react';
import { LogRow } from './LogRow';
import { entryMatches } from '../lib/filters';
import type { Filter, LogEntry, Tweaks } from '../types';

export interface LogListProps {
  entries: LogEntry[];
  filters: Filter[];
  pinned: Set<number>;
  onTogglePin: (id: number) => void;
  tweaks: Tweaks;
  autoScroll: boolean;
}

export function LogList({ entries, filters, pinned, onTogglePin, tweaks, autoScroll }: LogListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

  if (entries.length === 0) {
    return (
      <div className="log-area">
        <div className="log-scroll">
          <div className="empty-logs">
            <span>No logs yet</span>
            <span className="empty-logs-hint">waiting for the device…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="log-area">
      <div ref={scrollRef} className="log-scroll">
        {entries.map((e) => (
          <LogRow
            key={e.id}
            entry={e}
            density={tweaks.density}
            showTimestamps={tweaks.showTimestamps}
            showPid={tweaks.showPid}
            wrapLines={tweaks.wrapLines}
            pinned={pinned.has(e.id)}
            matches={entryMatches(e, filters)}
            onTogglePin={onTogglePin}
          />
        ))}
      </div>
    </div>
  );
}
