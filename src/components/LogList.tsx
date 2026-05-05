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
//   - The parent (`App.tsx`) writes the pixel delta of "rows that vanished
//     from the visible list because of FIFO trim while scroll-locked" into
//     `compensationRef`. After every render where `entries.length` changed
//     we run a layout effect that subtracts that delta from `scrollTop`
//     before paint, so the rows the user is reading stay anchored at their
//     on-screen position. The math uses the density-derived row-height
//     estimate; in wrap mode actual heights drift slightly, which is a
//     known limitation (documented in docs/TASKS.md).

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type UIEvent,
} from 'react';
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
  /** Pixels to subtract from scrollTop on next layout (set by App when
   *  the FIFO trim evicts visible entries while scroll-locked). */
  compensationRef?: MutableRefObject<number>;
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
  compensationRef,
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

  // Trim-anchor: consume pending compensation from App. Runs *before paint*
  // (useLayoutEffect) so the user never sees the intermediate "scrolled
  // forward" state where scrollHeight has shrunk but scrollTop hasn't.
  // Skipped if autoScroll has flipped on in the meantime (the auto-tail
  // effect above will pin to the bottom regardless).
  useLayoutEffect(() => {
    if (!compensationRef) return;
    const px = compensationRef.current;
    compensationRef.current = 0;
    if (px <= 0 || autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, el.scrollTop - px);
  }, [entries.length, autoScroll, compensationRef]);

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
