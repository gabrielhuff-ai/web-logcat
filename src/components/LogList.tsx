// Scrollable log area with sticky pinned block.
//
// Virtualisation:
//   - Past VIRTUAL_THRESHOLD entries we hand off to @tanstack/react-virtual
//     for windowed rendering.
//   - We do *not* use the absolute-positioning idiom (rows positioned with
//     `position: absolute; transform: translateY(start)`). Absolutely-
//     positioned children don't contribute to the parent's intrinsic width,
//     which prevents the scroll container from detecting horizontal
//     overflow when wrap-mode is off and the message cell expands past
//     the viewport. Instead, we render the visible window as normal block-
//     flow children with `paddingTop`/`paddingBottom` spacers above and
//     below, so each row is a real flow child whose width contributes to
//     the parent's `max-content` size.
//
// Scroll anchoring on head trim:
//   - The parent (`App.tsx`) calls `compensateScroll(px)` synchronously
//     inside `flushIncoming`, *before* the corresponding setLogs is
//     queued, so the new scrollTop is in place by the time the
//     virtualiser runs `getVirtualItems()` on the next render. This keeps
//     the visible items aligned with the user's scroll position with no
//     paint between the two — earlier we did it in a useLayoutEffect on
//     [entries], which adjusted scrollTop *after* the commit; the
//     virtualiser had already produced items for the old scroll position
//     so the browser briefly painted the misalignment as a "blink".
//   - The math uses the density-derived row-height estimate; in wrap mode
//     actual heights drift slightly (documented in docs/TASKS.md).

import { useEffect, useMemo, useRef, type UIEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as Icons from './Icons';
import { entryMatches } from '../lib/filters';
import { rowHeightFor } from '../lib/format';
import { LogRow } from './LogRow';
import type { Filter, LogEntry, Tweaks } from '../types';

const VIRTUAL_THRESHOLD = 800;

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
  /** Imperative API: parent registers a callback that subtracts pixels
   *  from scrollTop. Called synchronously inside flushIncoming when the
   *  FIFO trim evicts visible entries while scroll-locked. */
  registerCompensate?: (fn: (px: number) => void) => void;
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
  registerCompensate,
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

  // Trim-anchor: expose an imperative `compensateScroll(rowsTrimmed)` to
  // the parent. The parent calls it *synchronously* inside flushIncoming,
  // before setLogs is queued, so by the time the virtualiser re-renders
  // it reads the new scrollTop on the *same* render that produces the
  // new entries — visible items at their paddingTop offsets line up with
  // the user's scroll position with no flicker.
  //
  // We take a row count rather than a pixel delta so the multiplication
  // by the row height happens here, where we can use the *measured*
  // average from the virtualiser (`getTotalSize() / count`). That
  // matters in wrap mode: rows can wrap to multiple lines, so the static
  // density-derived estimate undershoots and the anchor drifts. The
  // measured average reflects actual heights to within a row or two.
  useEffect(() => {
    registerCompensate?.((rowsTrimmed: number) => {
      if (rowsTrimmed <= 0) return;
      const el = scrollRef.current;
      if (!el) return;
      const total = virtualize ? virtualizer.getTotalSize() : el.scrollHeight;
      const avg = entries.length > 0 && total > 0 ? total / entries.length : rowHeight;
      const px = rowsTrimmed * avg;
      el.scrollTop = Math.max(0, el.scrollTop - px);
    });
  }, [registerCompensate, virtualize, virtualizer, entries.length, rowHeight]);

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

  const renderRow = (l: LogEntry, keyPrefix = '') => (
    <LogRow
      key={`${keyPrefix}${l.id}`}
      entry={l}
      filters={filters}
      search={search}
      showTimestamps={tweaks.showTimestamps}
      showPid={tweaks.showPid}
      showProcess={tweaks.showProcess}
      showTag={tweaks.showTag}
      showLevel={tweaks.showLevel}
      wrapLines={tweaks.wrapLines}
      density={tweaks.density}
      pinned={pinned.has(l.id)}
      onTogglePin={onTogglePin}
      isMatch={matchSet.has(l.id)}
      isCrashHead={crashHeads.has(l.id)}
      expanded={expanded.has(l.id)}
      onToggleExpand={onToggleExpand}
    />
  );

  let body: React.ReactNode;
  if (entries.length === 0) {
    body = (
      <div className="empty-logs">
        <Icons.Filter size={20} />
        <div>No matching log lines</div>
        <div className="empty-logs-hint">
          {hasFilters
            ? "Try removing some filters or toggle off 'Only matches'"
            : `Waiting for logs from ${deviceModel}`}
        </div>
      </div>
    );
  } else if (virtualize) {
    const items = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();
    const top = items[0]?.start ?? 0;
    const last = items[items.length - 1];
    const bottom = last ? Math.max(0, totalSize - last.end) : 0;
    body = (
      <div style={{ paddingTop: top, paddingBottom: bottom }}>
        {items.map((vi) => renderRow(entries[vi.index]))}
      </div>
    );
  } else {
    body = entries.map((l) => renderRow(l));
  }

  return (
    <div className="log-scroll" ref={scrollRef} onScroll={onScroll}>
      {pinnedEntries.length > 0 && (
        <div className="pinned-block">
          <div className="pinned-head">PINNED</div>
          {pinnedEntries.map((l) => renderRow(l, 'pin-'))}
        </div>
      )}
      {body}
    </div>
  );
}
