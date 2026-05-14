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
// Scroll anchoring (Android-Studio-style):
//   - When `autoScroll` is on, we pin to the bottom on every entries
//     change. Standard "tail -f" behaviour.
//   - When the user scrolls away from the bottom, `autoScroll` flips off.
//     From that point we capture an *anchor* — the topmost visible
//     entry's id + its sub-pixel offset within the viewport — on every
//     scroll event. Whenever the entries array changes (new logs
//     streamed in, or the FIFO trim drops the head once the 50 k cap
//     is reached) a `useLayoutEffect` looks the anchor entry up by id
//     and restores `scrollTop` so it lands at the same screen-Y. The
//     user's window of logs stays put; new arrivals queue invisibly
//     past the viewport bottom; trims happen above the visible area
//     without shifting it.
//   - If the anchor itself was trimmed away (rare — only if the user
//     scrolled to the very top of a 50 k buffer and waited for tens of
//     thousands of new lines), we fall back to pinning the user at the
//     new oldest entry instead of forcing them back to the bottom.
//   - Anchor capture happens in the scroll handler rather than every
//     render so it doesn't fight with auto-scroll-to-bottom or the
//     restore loop. The "topmost visible" entry is found via the
//     virtualiser's `getVirtualItems()` (or arithmetic on rowHeight in
//     the non-virtualised path).

import { useEffect, useLayoutEffect, useMemo, useRef, type UIEvent } from 'react';
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
  /** Highlight this entry id and let `registerScrollToId` jump to it. */
  activeMatchId?: number | null;
  /** Clicking a row's body selects it (same effect as find-next-match). */
  onSelectRow?: (id: number) => void;
  /** Imperative API: parent calls this to scroll to a given timestamp. */
  registerScrollToTs?: (fn: (ts: number) => void) => void;
  /** Imperative API: parent calls this to scroll a specific entry id
   *  into the centre of the viewport (used by find-next-match). */
  registerScrollToId?: (fn: (id: number) => void) => void;
  /** Imperative API: capture the active row's current screen-Y so that
   *  on the next entries change (e.g. "only matches" toggle) the row is
   *  restored to the same screen position rather than re-centred. Rows
   *  off-screen above clamp to the top of the viewport; rows below
   *  clamp to the bottom. */
  registerPreserveActivePosition?: (fn: () => void) => void;
}

interface ScrollAnchor {
  /** Entry id at the top of the viewport. */
  id: number;
  /** Sub-pixel offset of the entry's top edge above the viewport top
   *  (negative when the entry is partially scrolled off the top). */
  offset: number;
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
  activeMatchId,
  onSelectRow,
  registerScrollToTs,
  registerScrollToId,
  registerPreserveActivePosition,
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

  // Auto-scroll to bottom on new content while autoScroll is on. The
  // anchor branch below skips this path entirely.
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

  // ---- Scroll anchor preservation ----------------------------------------
  // While `autoScroll === false`, capture the topmost visible entry on
  // every scroll. On entries change, restore `scrollTop` so that entry
  // stays in the same screen position. This eliminates the "logs
  // jump" effect when the FIFO trims the head while the user is
  // viewing intermediate logs.
  const anchorRef = useRef<ScrollAnchor | null>(null);
  // Skip the anchor restore on the very first render so we don't fight
  // the hub's snapshot replay (which lands a full buffer in one go).
  const firstRenderRef = useRef(true);

  /** Find the entry at the top of the viewport, plus its sub-pixel
   *  offset above the viewport top. */
  const captureAnchor = (): ScrollAnchor | null => {
    const el = scrollRef.current;
    if (!el || entries.length === 0) return null;
    const scrollTop = el.scrollTop;
    if (virtualize) {
      // Iterate the live virtual items — the first one whose `end`
      // exceeds scrollTop straddles the viewport top.
      const items = virtualizer.getVirtualItems();
      for (const it of items) {
        if (it.end > scrollTop) {
          const entry = entries[it.index];
          if (!entry) return null;
          return { id: entry.id, offset: scrollTop - it.start };
        }
      }
      return null;
    }
    // Non-virtualised: row heights are uniform.
    const idx = Math.min(entries.length - 1, Math.floor(scrollTop / rowHeight));
    const entry = entries[idx];
    if (!entry) return null;
    return { id: entry.id, offset: scrollTop - idx * rowHeight };
  };

  useLayoutEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (autoScroll) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const el = scrollRef.current;
    if (!el) return;
    // Find the anchor entry's new index. `findIndex` is O(n); for the
    // 50 k worst case this is 50 k pointer comparisons per render — a
    // few hundred microseconds, well under one frame. If perf shows up
    // we can swap for a Map<id, idx> built once per render.
    const newIdx = entries.findIndex((e) => e.id === anchor.id);
    if (newIdx < 0) {
      // Anchor evicted — re-anchor on whatever's now at the top of the
      // buffer instead of falling back to autoScroll. Picks the new
      // first entry as the anchor with offset 0.
      const first = entries[0];
      if (first) {
        anchorRef.current = { id: first.id, offset: 0 };
        el.scrollTop = 0;
      }
      return;
    }
    const offset = virtualize
      ? virtualizer.getOffsetForIndex(newIdx, 'start')?.[0] ?? newIdx * rowHeight
      : newIdx * rowHeight;
    const target = Math.max(0, offset + anchor.offset);
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTop = target;
    }
  }, [entries, autoScroll, virtualize, virtualizer, rowHeight]);

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

  // Imperative jump-to-id used by find-next-match. Scrolls the
  // matched row to the centre of the viewport. Disables autoScroll
  // so subsequent stream batches don't yank the view.
  useEffect(() => {
    registerScrollToId?.((id) => {
      const idx = entries.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const el = scrollRef.current;
      if (!el) return;
      if (virtualize) {
        virtualizer.scrollToIndex(idx, { align: 'center' });
      } else {
        const target = idx * rowHeight - el.clientHeight / 2 + rowHeight / 2;
        el.scrollTop = Math.max(0, target);
      }
      setAutoScroll(false);
    });
  }, [entries, virtualize, virtualizer, rowHeight, setAutoScroll, registerScrollToId]);

  // Imperative "preserve active match's screen-Y across the next
  // entries change" — used by the "only matches" toggle so the user's
  // current focal row stays put instead of jumping to the centre.
  // Captures the row's current top-Y relative to the viewport into a
  // ref. The useLayoutEffect below consumes the ref on the next
  // entries commit.
  const preserveCaptureRef = useRef<{
    id: number;
    screenY: number;
    viewportH: number;
  } | null>(null);
  useEffect(() => {
    registerPreserveActivePosition?.(() => {
      const el = scrollRef.current;
      if (!el || activeMatchId == null) return;
      const idx = entries.findIndex((l) => l.id === activeMatchId);
      if (idx < 0) return;
      const rowTop = virtualize
        ? virtualizer.getOffsetForIndex(idx, 'start')?.[0] ?? idx * rowHeight
        : idx * rowHeight;
      preserveCaptureRef.current = {
        id: activeMatchId,
        screenY: rowTop - el.scrollTop,
        viewportH: el.clientHeight,
      };
    });
  }, [
    activeMatchId,
    entries,
    virtualize,
    virtualizer,
    rowHeight,
    registerPreserveActivePosition,
  ]);

  // Restore captured screen-Y when entries change. Declared after the
  // anchor-restore useLayoutEffect so it overrides that effect's scroll
  // adjustment on the toggle commit. Edge cases: rows above the
  // viewport snap to the top; rows below snap to the bottom.
  useLayoutEffect(() => {
    const cap = preserveCaptureRef.current;
    if (!cap) return;
    preserveCaptureRef.current = null;
    const el = scrollRef.current;
    if (!el) return;
    const idx = entries.findIndex((l) => l.id === cap.id);
    if (idx < 0) return;
    const rowTop = virtualize
      ? virtualizer.getOffsetForIndex(idx, 'start')?.[0] ?? idx * rowHeight
      : idx * rowHeight;
    let targetY = cap.screenY;
    if (cap.screenY < 0) {
      targetY = 0;
    } else if (cap.screenY + rowHeight > cap.viewportH) {
      targetY = Math.max(0, cap.viewportH - rowHeight);
    }
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.max(0, Math.min(maxScroll, rowTop - targetY));
    // Suppress the auto-scroll-to-bottom side effect of being close
    // to the end: the user just toggled, they didn't request tail mode.
    setAutoScroll(false);
    // Reset the anchor so the streaming-anchor restore doesn't fight
    // with the freshly-applied position on the next render.
    anchorRef.current = null;
  }, [entries, virtualize, virtualizer, rowHeight, setAutoScroll]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist > 60 && autoScroll) setAutoScroll(false);
    if (dist < 4 && !autoScroll) setAutoScroll(true);
    // Refresh the anchor on every scroll so the next entries-change
    // restores from the user's current vantage point. Skip while
    // autoScroll is on — we don't need an anchor in tail mode.
    if (dist >= 4) {
      anchorRef.current = captureAnchor();
    } else {
      anchorRef.current = null;
    }
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
      isActiveMatch={activeMatchId === l.id}
      isCrashHead={crashHeads.has(l.id)}
      expanded={expanded.has(l.id)}
      onToggleExpand={onToggleExpand}
      onSelect={onSelectRow}
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
      <div
        className="row-list"
        data-wrap={tweaks.wrapLines ? 'true' : 'false'}
        style={{ paddingTop: top, paddingBottom: bottom }}
      >
        {items.map((vi) => renderRow(entries[vi.index]))}
      </div>
    );
  } else {
    body = (
      <div className="row-list" data-wrap={tweaks.wrapLines ? 'true' : 'false'}>
        {entries.map((l) => renderRow(l))}
      </div>
    );
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
