// Scrollable log area with sticky pinned block.
//
// Virtualisation: rendering all 5000 rows is fine up to ~1000 visible
// rows but stutters past that. We use @tanstack/react-virtual when the
// visible list exceeds VIRTUAL_THRESHOLD entries; below that, we render
// every row directly (cheaper, simpler, avoids row-height jitter when
// crash rows wrap).

import { useEffect, useMemo, useRef, type UIEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as Icons from './Icons';
import { entryMatches } from '../lib/filters';
import { LogRow } from './LogRow';
import type { Filter, LogEntry, Tweaks } from '../types';

const VIRTUAL_THRESHOLD = 800;

function rowHeightFor(density: Tweaks['density']): number {
  if (density === 'compact') return 22;
  if (density === 'comfortable') return 32;
  return 26;
}

export interface LogListProps {
  entries: LogEntry[];
  filters: Filter[];
  search: string;
  pinned: Set<number>;
  pinnedEntries: LogEntry[];
  onTogglePin: (id: number) => void;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  crashHeads: Set<number>;
  tweaks: Tweaks;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  deviceModel: string;
  hasFilters: boolean;
  /** Imperative API: parent calls this to scroll to a given timestamp. */
  registerScrollToTs?: (fn: (ts: number) => void) => void;
}

export function LogList({
  entries,
  filters,
  search,
  pinned,
  pinnedEntries,
  onTogglePin,
  expanded,
  onToggleExpand,
  crashHeads,
  tweaks,
  autoScroll,
  setAutoScroll,
  deviceModel,
  hasFilters,
  registerScrollToTs,
}: LogListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = rowHeightFor(tweaks.density);
  const virtualize = entries.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: virtualize,
  });

  // Auto-scroll to bottom on new content while autoScroll is on.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    if (virtualize) {
      virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length, autoScroll, virtualize, virtualizer]);

  // Imperative jump-to-timestamp from the heatmap.
  useEffect(() => {
    registerScrollToTs?.((ts) => {
      const idx = entries.findIndex((l) => l.ts >= ts);
      if (idx < 0) return;
      const el = scrollRef.current;
      if (!el) return;
      if (virtualize) {
        virtualizer.scrollToIndex(idx, { align: 'center' });
      } else {
        el.scrollTop = idx * rowHeight;
      }
      setAutoScroll(false);
    });
  }, [entries, virtualize, virtualizer, rowHeight, setAutoScroll, registerScrollToTs]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist > 60 && autoScroll) setAutoScroll(false);
    if (dist < 4 && !autoScroll) setAutoScroll(true);
  };

  const matchSet = useMemo(() => {
    const out = new Set<number>();
    if (filters.length === 0) return out;
    for (const e of entries) {
      if (entryMatches(e, filters).length > 0) out.add(e.id);
    }
    return out;
  }, [entries, filters]);

  return (
    <div className="log-scroll" ref={scrollRef} onScroll={onScroll}>
      {pinnedEntries.length > 0 && (
        <div className="pinned-block">
          <div className="pinned-head">PINNED</div>
          {pinnedEntries.map((l) => (
            <LogRow
              key={`pin-${l.id}`}
              entry={l}
              filters={filters}
              search={search}
              showTimestamps={tweaks.showTimestamps}
              showPid={tweaks.showPid}
              wrapLines={tweaks.wrapLines}
              density={tweaks.density}
              pinned
              onTogglePin={onTogglePin}
              isMatch={matchSet.has(l.id)}
              isCrashHead={crashHeads.has(l.id)}
              expanded={expanded.has(l.id)}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-logs">
          <Icons.Filter size={20} />
          <div>No matching log lines</div>
          <div className="empty-logs-hint">
            {hasFilters
              ? "Try removing some filters or toggle off 'Only matches'"
              : `Waiting for logs from ${deviceModel}`}
          </div>
        </div>
      ) : virtualize ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const l = entries[vi.index];
            return (
              <div
                key={l.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <LogRow
                  entry={l}
                  filters={filters}
                  search={search}
                  showTimestamps={tweaks.showTimestamps}
                  showPid={tweaks.showPid}
                  wrapLines={tweaks.wrapLines}
                  density={tweaks.density}
                  pinned={pinned.has(l.id)}
                  onTogglePin={onTogglePin}
                  isMatch={matchSet.has(l.id)}
                  isCrashHead={crashHeads.has(l.id)}
                  expanded={expanded.has(l.id)}
                  onToggleExpand={onToggleExpand}
                />
              </div>
            );
          })}
        </div>
      ) : (
        entries.map((l) => (
          <LogRow
            key={l.id}
            entry={l}
            filters={filters}
            search={search}
            showTimestamps={tweaks.showTimestamps}
            showPid={tweaks.showPid}
            wrapLines={tweaks.wrapLines}
            density={tweaks.density}
            pinned={pinned.has(l.id)}
            onTogglePin={onTogglePin}
            isMatch={matchSet.has(l.id)}
            isCrashHead={crashHeads.has(l.id)}
            expanded={expanded.has(l.id)}
            onToggleExpand={onToggleExpand}
          />
        ))
      )}
    </div>
  );
}
