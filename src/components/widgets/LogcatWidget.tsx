// Logcat widget — the entire v1 logcat experience scoped to one tile.
//
// Owned by this component (per-instance state):
//   - filters / search / paused / autoScroll / onlyMatches
//   - levelEnabled / pinned / expanded
//   - the rate display
//
// Read from context:
//   - device                  — `useAdb()` (so the widget re-mounts cleanly
//                                on device change)
//   - shared log stream       — `useLogStream()` (single upstream → N
//                                widget subscribers; see lib/logStream.ts)
//   - tweaks + showToast      — `useDashboardChrome()` (for theme-driven
//                                density / display toggles + toast on clear)
//
// Filter persistence: `weblogcat:filters:<serial>:<tileId>` extends the
// v1 `weblogcat:filters:<serial>` key with the tile id so two Logcat
// tiles on the same device get independent chip bars.
//
// Keyboard shortcuts (Space / ⌘K / ⌘F / / / Esc) only fire when this
// widget owns focus — the listener is mounted on a `tabIndex=-1` wrapper
// and gated on `document.activeElement` being inside it. The HANDOFF
// §Interactions Cheat Sheet calls this out explicitly: with multiple
// Logcat tiles the global shortcut would otherwise toggle every tile.

import '../../styles/widgets/logcat.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { FilterBar } from '../FilterBar';
import { LevelRow } from '../LevelRow';
import { LogList } from '../LogList';
import { Heatmap, type HeatmapBucket } from '../Heatmap';
import { SearchOverlay } from '../SearchOverlay';
import * as Icons from '../Icons';
import { entryMatches, makeFilter } from '../../lib/filters';
import { KNOWN_PROCESSES, KNOWN_TAGS } from '../../lib/knownNames';
import { useAdb } from '../../lib/adbContext';
import { useLogStream } from '../../lib/logStreamContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import type {
  Filter,
  LevelEnabled,
  LogEntry,
  LogLevel,
} from '../../types';

export interface LogcatWidgetProps {
  /** Stable id of the host tile — used to namespace filter persistence. */
  tileId: string;
}

export function LogcatWidget({ tileId }: LogcatWidgetProps) {
  const { device } = useAdb();
  const hub = useLogStream();
  const { tweaks, setTweaks, showToast } = useDashboardChrome();

  const [logs, setLogs] = useState<LogEntry[]>(() => [...hub.snapshot()]);

  const [filters, setFilters] = useState<Filter[]>([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelEnabled, setLevelEnabled] = useState<LevelEnabled>({
    V: true,
    D: true,
    I: true,
    W: true,
    E: true,
  });
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rate, setRate] = useState(0);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ---- Subscribe to the shared log stream --------------------------------
  // Snapshots replace the whole buffer (used on connect / clear); appends
  // are deltas. The hub's ring-buffer trim happens upstream, so this
  // widget's `logs` mirrors the hub's view exactly when not paused.
  // Per-tile pause is honoured by dropping appends but keeping the
  // current `logs` snapshot — matches v1 behaviour.
  useEffect(() => {
    const unsubscribe = hub.subscribe((entries, kind) => {
      if (kind === 'snapshot') {
        setLogs([...entries]);
        return;
      }
      if (pausedRef.current) return;
      setLogs((prev) => {
        const next = prev.concat(entries);
        // Mirror the hub's ring trim so per-widget memory stays bounded.
        const cap = hubCap(hub);
        if (next.length > cap) next.splice(0, next.length - cap);
        return next;
      });
    });
    return unsubscribe;
  }, [hub]);

  // ---- Live rate display -------------------------------------------------
  const logsRef = useRef(logs);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  useEffect(() => {
    const t = window.setInterval(() => {
      const cutoff = Date.now() - 1000;
      const arr = logsRef.current;
      let n = 0;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].ts < cutoff) break;
        n++;
      }
      setRate(n);
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  // ---- Auto-toggle "only matches" on first filter ------------------------
  const prevFilterCountRef = useRef(filters.length);
  useEffect(() => {
    const prev = prevFilterCountRef.current;
    const curr = filters.length;
    if (prev === 0 && curr > 0) setOnlyMatches(true);
    else if (prev > 0 && curr === 0) setOnlyMatches(false);
    prevFilterCountRef.current = curr;
  }, [filters.length]);

  // ---- Filter persistence (per device serial × tile id) ------------------
  // Extends the v1 `weblogcat:filters:<serial>` key with the tile id so
  // two Logcat tiles on the same device get independent chip bars.
  const filtersKey = device ? `weblogcat:filters:${device.serial}:${tileId}` : null;
  useEffect(() => {
    if (!filtersKey) return;
    let parsed: Array<{ type: string; value: string }>;
    try {
      const raw = localStorage.getItem(filtersKey);
      if (!raw) return;
      parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
    } catch {
      return;
    }
    const restored: Filter[] = [];
    for (const p of parsed) {
      if (typeof p?.value !== 'string') continue;
      const input = p.type === 'message' ? p.value : `${p.type}:${p.value}`;
      const f = makeFilter(input);
      if (f) restored.push(f);
    }
    if (restored.length > 0) setFilters(restored);
  }, [filtersKey]);

  useEffect(() => {
    if (!filtersKey) return;
    try {
      const slim = filters.map(({ type, value }) => ({ type, value }));
      localStorage.setItem(filtersKey, JSON.stringify(slim));
    } catch {
      // ignore quota / privacy mode
    }
  }, [filtersKey, filters]);

  // ---- Derived data ------------------------------------------------------
  const knownProcesses = useMemo(() => {
    const s = new Set(KNOWN_PROCESSES);
    for (const l of logs) s.add(l.pkg);
    return [...s].sort();
  }, [logs]);

  const knownTags = useMemo(() => {
    const s = new Set(KNOWN_TAGS);
    for (const l of logs) s.add(l.tag);
    return [...s].sort();
  }, [logs]);

  const crashHeads = useMemo(() => {
    const heads = new Set<number>();
    let prev = false;
    for (const e of logs) {
      if (e.isCrashLine && !prev) heads.add(e.id);
      prev = !!e.isCrashLine;
    }
    return heads;
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((e) => {
      if (!levelEnabled[e.level]) return false;
      if (e.isCrashLine && !crashHeads.has(e.id)) {
        const head = closestCrashHead(e, logs, crashHeads);
        if (head < 0 || !expanded.has(head)) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (
          !e.message.toLowerCase().includes(s) &&
          !e.tag.toLowerCase().includes(s) &&
          !e.pkg.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      if (onlyMatches && filters.length > 0) {
        if (!entryMatches(e, filters).length) return false;
      }
      return true;
    });
  }, [logs, levelEnabled, search, onlyMatches, filters, expanded, crashHeads]);

  const pinnedEntries = useMemo(
    () => logs.filter((l) => pinned.has(l.id)),
    [logs, pinned],
  );

  const buckets = useMemo<HeatmapBucket[]>(() => {
    const now = Date.now();
    const out: HeatmapBucket[] = [];
    for (let i = 59; i >= 0; i--) {
      const start = now - (i + 1) * 1000;
      const end = now - i * 1000;
      const counts: Record<LogLevel, number> = { V: 0, D: 0, I: 0, W: 0, E: 0 };
      let total = 0;
      for (const l of logs) {
        if (l.ts >= start && l.ts < end) {
          counts[l.level]++;
          total++;
        }
      }
      let dominant: LogLevel = 'I';
      if (counts.E > 0) dominant = 'E';
      else if (counts.W > 1) dominant = 'W';
      else {
        let best = -1;
        for (const k of ['I', 'D', 'V'] as LogLevel[]) {
          if (counts[k] > best) {
            best = counts[k];
            dominant = k;
          }
        }
      }
      out.push({ count: total, dominant, secondsAgo: i });
    }
    return out;
  }, [logs]);

  // ---- Handlers ----------------------------------------------------------
  const togglePin = useCallback((id: number) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Per-widget "clear" only clears the local view — clearing the shared
  // ring buffer would yank logs out from under sibling Logcat tiles.
  // Decision: this matches the v1 semantics (Clear is a per-viewer concept)
  // and gives users an obvious escape hatch from a noisy state.
  const onClear = useCallback(() => {
    setLogs([]);
    setPinned(new Set());
    setExpanded(new Set());
    showToast('Logs cleared');
  }, [showToast]);

  // ---- Per-widget keyboard shortcuts -------------------------------------
  // Only fire when focus is inside this widget. We don't want global
  // ⌘F to toggle search on every Logcat tile at once.
  const rootRef = useRef<HTMLDivElement>(null);
  const focusFilterRef = useRef<(() => void) | null>(null);
  const scrollToTsRef = useRef<((ts: number) => void) | null>(null);
  const compensateScrollRef = useRef<((rowsTrimmed: number) => void) | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const active = document.activeElement;
      if (!root.contains(active)) return;
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.code === 'Space' && !inField) {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === '/' && !inField) {
        e.preventDefault();
        focusFilterRef.current?.();
      }
      if (e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false);
          setSearch('');
        }
      }
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, onClear]);

  // Click anywhere in the widget body grabs focus for shortcut routing.
  // The wrapper has `tabIndex={-1}` so it's programmatically focusable
  // without entering the tab order.
  const onMouseDownWidget = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    const tgt = e.target as HTMLElement;
    if (!root || root.contains(document.activeElement)) return;
    if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
    root.focus();
  }, []);

  if (!device) {
    return (
      <div className="lc-widget" style={{ padding: 16, color: 'var(--fg-3)' }}>
        Disconnected.
      </div>
    );
  }

  return (
    <div
      className="lc-widget"
      ref={rootRef}
      tabIndex={-1}
      onMouseDown={onMouseDownWidget}
    >
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onlyMatches={onlyMatches}
        setOnlyMatches={setOnlyMatches}
        knownProcesses={knownProcesses}
        knownTags={knownTags}
        paused={paused}
        setPaused={setPaused}
        onClear={onClear}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        wrapLines={tweaks.wrapLines}
        setWrapLines={(v) => setTweaks({ wrapLines: v })}
        registerFocusHandler={(fn) => {
          focusFilterRef.current = fn;
        }}
      />

      <LevelRow
        enabled={levelEnabled}
        setEnabled={setLevelEnabled}
        rate={rate}
        filteredCount={filtered.length}
        totalCount={logs.length}
        pinnedCount={pinned.size}
        onClearPinned={() => setPinned(new Set())}
        paused={paused}
        showTimestamps={tweaks.showTimestamps}
        setShowTimestamps={(v) => setTweaks({ showTimestamps: v })}
        showPid={tweaks.showPid}
        setShowPid={(v) => setTweaks({ showPid: v })}
        showProcess={tweaks.showProcess}
        setShowProcess={(v) => setTweaks({ showProcess: v })}
        showTag={tweaks.showTag}
        setShowTag={(v) => setTweaks({ showTag: v })}
        showLevel={tweaks.showLevel}
        setShowLevel={(v) => setTweaks({ showLevel: v })}
      />

      <div className="log-area">
        {tweaks.showHeatmap && (
          <Heatmap
            buckets={buckets}
            onJumpToSecond={(i) => {
              const targetTs = Date.now() - (59 - i) * 1000;
              scrollToTsRef.current?.(targetTs);
            }}
          />
        )}
        <LogList
          entries={filtered}
          filters={filters}
          search={search}
          pinned={pinned}
          pinnedEntries={pinnedEntries}
          onTogglePin={togglePin}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          crashHeads={crashHeads}
          tweaks={tweaks}
          autoScroll={autoScroll}
          setAutoScroll={setAutoScroll}
          deviceModel={device.model}
          hasFilters={filters.length > 0}
          registerCompensate={(fn) => {
            compensateScrollRef.current = fn;
          }}
          registerScrollToTs={(fn) => {
            scrollToTsRef.current = fn;
          }}
        />
      </div>

      {!autoScroll && (
        <button
          className="scroll-to-bottom lc-resume"
          onClick={() => setAutoScroll(true)}
        >
          <Icons.Down size={13} /> Resume tail
        </button>
      )}

      <SearchOverlay
        open={searchOpen}
        query={search}
        matchCount={filtered.length}
        onChange={setSearch}
        onClose={() => {
          setSearchOpen(false);
          setSearch('');
        }}
      />
    </div>
  );
}

/** Read the hub's effective cap. Avoids importing the constant directly so
 *  if the hub ever exposes a per-instance cap we pick it up. */
function hubCap(_hub: unknown): number {
  return 5000;
}

function closestCrashHead(entry: LogEntry, logs: LogEntry[], heads: Set<number>): number {
  const idx = logs.findIndex((l) => l.id === entry.id);
  for (let i = idx; i >= 0; i--) {
    if (heads.has(logs[i].id)) return logs[i].id;
  }
  return -1;
}
