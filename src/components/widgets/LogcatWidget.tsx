// Logcat widget — the entire v1 logcat experience scoped to one tile.
//
// Per-tile settings (font size, density, heatmap, wrap, column toggles,
// level toggles, filters, autoScroll, paused) live in `useTileSettings`
// and are shared with the per-widget settings modal. Bar controls and
// modal controls write through the same setter — single source of truth.
// Ephemeral state (logs, pinned) stays on local `useState`.
//
// Read from context:
//   - device                  — `useAdb()` (so the widget re-mounts cleanly
//                                on device change)
//   - shared log stream       — `useLogStream()` (single upstream → N
//                                widget subscribers; see lib/logStream.ts)
//   - global tweaks + toast   — `useDashboardChrome()` (global theme /
//                                density acts as the dashboard-wide default
//                                for fields the per-tile settings don't
//                                override)
//
// Filter persistence: the v1/v2 `weblogcat:filters:<serial>:<tileId>` key
// is folded into `settings.filters` by the migration registered in
// `logcat/logcatSettings.ts` so existing users don't lose their chips.
//
// Keyboard shortcuts (Space / ⌘K / ⌘G / /) only fire when this
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
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { FilterBar } from '../FilterBar';
import { LevelRow } from '../LevelRow';
import { LogList } from '../LogList';
import { Heatmap, type HeatmapBucket } from '../Heatmap';
import * as Icons from '../Icons';
import { entryMatches, makeFilter } from '../../lib/filters';
import { KNOWN_PROCESSES, KNOWN_TAGS } from '../../lib/knownNames';
import { useAdb } from '../../lib/adbContext';
import { useLogStream } from '../../lib/logStreamContext';
import { useDashboardChrome } from '../../lib/dashboardChrome';
import { useTileSettings } from '../../lib/tileSettings';
import { LOGCAT_DEFAULTS, type LogcatSettings } from './logcat/logcatSettings';
import type {
  Filter,
  LevelEnabled,
  LogEntry,
  LogLevel,
  Tweaks,
} from '../../types';

export interface LogcatWidgetProps {
  /** Stable id of the host tile — used to namespace per-instance state. */
  tileId: string;
}

export function LogcatWidget({ tileId }: LogcatWidgetProps) {
  const { device } = useAdb();
  const hub = useLogStream();
  const { tweaks } = useDashboardChrome();
  const [settings, setSettings] = useTileSettings<LogcatSettings>(
    tileId,
    'logcat',
    LOGCAT_DEFAULTS,
  );

  // ---- Filter materialisation -------------------------------------------
  // The persisted shape is the slim `{ type, value }` form; rebuild full
  // `Filter` objects (with id + color) on hydration. We track a parallel
  // live array to avoid re-deriving on every render.
  const [filters, setFilters] = useState<Filter[]>(() => slimToFull(settings.filters));
  const filtersSlimRef = useRef(settings.filters);
  useEffect(() => {
    // Detect external (modal) writes to filters and re-materialise.
    if (filtersSlimRef.current !== settings.filters) {
      filtersSlimRef.current = settings.filters;
      const incoming = slimToFull(settings.filters);
      // Skip the rebuild if it would yield the same effective list, to
      // avoid clobbering the live `id` numbers when the user is editing.
      if (!sameSlim(filters, settings.filters)) setFilters(incoming);
    }
  }, [settings.filters, filters]);
  const setFiltersBoth = useCallback(
    (next: Filter[]) => {
      setFilters(next);
      const slim = next.map(({ type, value }) => ({ type, value }));
      filtersSlimRef.current = slim;
      setSettings({ filters: slim });
    },
    [setSettings],
  );

  // ---- Ephemeral state ---------------------------------------------------
  const [logs, setLogs] = useState<LogEntry[]>(() => [...hub.snapshot()]);
  const [onlyMatches, setOnlyMatches] = useState(false);
  // Find-next-match state. `activeFilterId` selects which chip drives
  // navigation; `activeMatchId` is the currently-highlighted entry.
  const [activeFilterId, setActiveFilterId] = useState<number | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  // Tracks recent mouse activity over the widget body. Drives the
  // auto-fade for the scrollbar thumbs and the Resume-tail pill so
  // the chrome only appears while the user is actually interacting,
  // matching the macOS Chrome scrollbar idle-fade pattern.
  const [active, setActive] = useState(false);
  const activeTimerRef = useRef<number | null>(null);
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rate, setRate] = useState(0);

  // ---- Settings shortcuts ------------------------------------------------
  const paused = settings.paused;
  const autoScroll = settings.autoScroll;
  const levelEnabled = settings.levelEnabled;

  const setPaused = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof v === 'function' ? (v as (prev: boolean) => boolean)(paused) : v;
      setSettings({ paused: next });
    },
    [paused, setSettings],
  );
  const setAutoScroll = useCallback(
    (v: boolean) => setSettings({ autoScroll: v }),
    [setSettings],
  );
  const setLevelEnabled = useCallback(
    (v: LevelEnabled) => setSettings({ levelEnabled: v }),
    [setSettings],
  );

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ---- Subscribe to the shared log stream --------------------------------
  useEffect(() => {
    const unsubscribe = hub.subscribe((entries, kind) => {
      if (kind === 'snapshot') {
        setLogs([...entries]);
        return;
      }
      if (pausedRef.current) return;
      setLogs((prev) => {
        const next = prev.concat(entries);
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
      // Skip the commit when the count hasn't changed — common on idle
      // streams. Each setRate forces LevelRow to re-render, which is
      // wasted work when the value is the same.
      setRate((prev) => (prev === n ? prev : n));
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
      if (onlyMatches && filters.length > 0) {
        if (!entryMatches(e, filters).length) return false;
      }
      return true;
    });
  }, [logs, levelEnabled, onlyMatches, filters, expanded, crashHeads]);

  const pinnedEntries = useMemo(
    () => logs.filter((l) => pinned.has(l.id)),
    [logs, pinned],
  );

  // The bucket scan is O(60 × |logs|) — at MAX_LOGS = 5000 that's 300k
  // comparisons every time the stream batches in new entries (i.e. several
  // times a second). Skip the whole compute when the heatmap is hidden;
  // <Heatmap/> below is also gated on the same flag, so the empty array
  // is never read.
  const buckets = useMemo<HeatmapBucket[]>(() => {
    if (!settings.heatmap) return [];
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
  }, [logs, settings.heatmap]);

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

  const { showToast } = useDashboardChrome();
  const onClear = useCallback(() => {
    setLogs([]);
    setPinned(new Set());
    setExpanded(new Set());
    showToast('Logs cleared');
  }, [showToast]);

  const onExport = useCallback(() => {
    const lines = filtered.map(formatExportLine).join('\n');
    const blob = new Blob([lines + (lines ? '\n' : '')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weblogcat-${device?.serial ?? 'unknown'}-${formatExportStamp(new Date())}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${filtered.length.toLocaleString()} lines`);
  }, [filtered, device, showToast]);

  // ---- Per-widget keyboard shortcuts -------------------------------------
  const rootRef = useRef<HTMLDivElement>(null);
  const focusFilterRef = useRef<(() => void) | null>(null);
  const scrollToTsRef = useRef<((ts: number) => void) | null>(null);
  const scrollToIdRef = useRef<((id: number) => void) | null>(null);
  const preserveActivePositionRef = useRef<(() => void) | null>(null);
  // Suppresses the scroll-to-active-match effect for a specific entry
  // id. Used by row-click selection (the user clicked the row, so it's
  // already on screen — no scroll needed). Keyed by id rather than a
  // boolean so that clicking the same row twice doesn't leave a stale
  // flag that would later swallow a real navigation scroll.
  const skipScrollForIdRef = useRef<number | null>(null);

  // ---- Find-next-match orchestration -----------------------------------
  const activeFilter = useMemo(
    () => filters.find((f) => f.id === activeFilterId) ?? null,
    [filters, activeFilterId],
  );
  // Match list = entries (in viewport order) matching just the active
  // filter. We compute over `filtered` so level-toggle / search /
  // onlyMatches all narrow the navigation universe sensibly.
  const matchEntryIds = useMemo<number[]>(() => {
    if (!activeFilter) return [];
    const out: number[] = [];
    for (const e of filtered) {
      if (entryMatches(e, [activeFilter]).length > 0) out.push(e.id);
    }
    return out;
  }, [filtered, activeFilter]);

  const currentMatchIndex = activeMatchId != null
    ? matchEntryIds.indexOf(activeMatchId)
    : -1;

  // Selection survives as long as the row is still in the visible
  // buffer. We tolerate non-matching selections (row-click can pick
  // anything) and only clear when the entry is gone — e.g. trimmed
  // from the FIFO or hidden by a level toggle.
  const filteredIds = useMemo(() => {
    const s = new Set<number>();
    for (const e of filtered) s.add(e.id);
    return s;
  }, [filtered]);
  useEffect(() => {
    if (activeMatchId != null && !filteredIds.has(activeMatchId)) {
      setActiveMatchId(null);
    }
  }, [activeMatchId, filteredIds]);

  const onAdvanceMatch = useCallback(() => {
    if (matchEntryIds.length === 0) return;
    const next = currentMatchIndex < 0
      ? 0
      : (currentMatchIndex + 1) % matchEntryIds.length;
    setActiveMatchId(matchEntryIds[next]);
  }, [matchEntryIds, currentMatchIndex]);

  const onRetreatMatch = useCallback(() => {
    if (matchEntryIds.length === 0) return;
    const prev = currentMatchIndex <= 0
      ? matchEntryIds.length - 1
      : currentMatchIndex - 1;
    setActiveMatchId(matchEntryIds[prev]);
  }, [matchEntryIds, currentMatchIndex]);

  // Row-click selection: same visual + cursor semantics as find-next-
  // match, but the row is already on screen so suppress the scroll.
  const onSelectRow = useCallback((id: number) => {
    skipScrollForIdRef.current = id;
    setActiveMatchId(id);
  }, []);

  // Selecting a filter: "continue navigation" from the current row.
  //   - No current selection → jump to the first match.
  //   - Current selection is already a match of this filter → leave it
  //     (so switching between two filters that share matches doesn't
  //     lose the user's place).
  //   - Otherwise → jump to the first match WHOSE id is greater than
  //     the current selection's id, i.e. the next match after the
  //     focal row. Wraps to the first match when there's nothing
  //     after. Entry ids are assigned monotonically from a single
  //     counter (see lib/logGenerator.ts and lib/adb.ts), so id
  //     ordering matches viewport order.
  useEffect(() => {
    if (activeFilterId == null) return;
    if (matchEntryIds.length === 0) return;
    if (activeMatchId != null && matchEntryIds.includes(activeMatchId)) return;
    let nextId = matchEntryIds[0];
    if (activeMatchId != null) {
      const after = matchEntryIds.find((id) => id > activeMatchId);
      if (after !== undefined) nextId = after;
    }
    setActiveMatchId(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilterId, matchEntryIds.length]);

  // Single source of truth for "scroll to the active match" — fires
  // once activeMatchId settles, which means all cascading state
  // updates (onlyMatches toggle, filtered recompute) have committed
  // first. Skips when the activation came from a row click on this
  // exact id.
  useEffect(() => {
    if (activeMatchId == null) return;
    if (skipScrollForIdRef.current === activeMatchId) {
      skipScrollForIdRef.current = null;
      return;
    }
    skipScrollForIdRef.current = null;
    scrollToIdRef.current?.(activeMatchId);
  }, [activeMatchId]);

  // "Show only matches" toggle: capture the active row's current
  // screen-Y synchronously, then flip the flag. LogList consumes the
  // capture in a useLayoutEffect to restore the same Y on the new
  // entries. Edge cases (row above/below the viewport) are clamped to
  // the viewport edges inside LogList. We also disable autoScroll
  // synchronously so the in-LogList "auto-scroll to bottom on entries
  // change" useEffect doesn't race ahead of the preserve handoff and
  // yank the view to the new buffer's tail.
  const onToggleOnlyMatches = useCallback(
    (v: boolean) => {
      if (activeMatchId != null) {
        preserveActivePositionRef.current?.();
        setAutoScroll(false);
      }
      setOnlyMatches(v);
    },
    [activeMatchId, setAutoScroll],
  );

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
      // ⌘G / ⌘⇧G — find-next / find-previous (mirrors browsers,
      // editors, and Finder). With no active chip, fall back to the
      // rightmost filter so the shortcut still does something useful
      // after a fresh chip add. The activation triggers the existing
      // "first match on filter select" effect, so the user lands on
      // matchEntryIds[0]; subsequent ⌘G then steps through.
      if (e.key.toLowerCase() === 'g' && (e.metaKey || e.ctrlKey)) {
        if (activeFilterId !== null) {
          e.preventDefault();
          if (e.shiftKey) onRetreatMatch();
          else onAdvanceMatch();
        } else if (filters.length > 0) {
          e.preventDefault();
          setActiveFilterId(filters[filters.length - 1].id);
        }
      }
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    onClear,
    setPaused,
    activeFilterId,
    filters,
    onAdvanceMatch,
    onRetreatMatch,
  ]);

  const onMouseDownWidget = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    const tgt = e.target as HTMLElement;
    if (!root || root.contains(document.activeElement)) return;
    if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
    root.focus();
  }, []);

  // Clicks on the tile chrome (header, drag grip, eye / settings /
  // close buttons) live OUTSIDE `.lc-widget` so `onMouseDownWidget`
  // never fires for them. TileGrid's pointerdown handler also blurs
  // whatever input had focus, so without recovery the activeElement
  // falls back to <body> and the widget's keydown listener — gated on
  // `root.contains(activeElement)` — stops catching ⌘G. Re-focus the
  // widget root via a microtask so the recovery happens AFTER the
  // synthetic React handlers (which run on the bubble at the document
  // root) have had a chance to perform the blur.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tile = root.closest('.tile');
    if (!tile) return;
    const onTilePointerDown = (e: Event) => {
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      // Clicks inside the widget body are covered by `onMouseDownWidget`.
      if (root.contains(tgt)) return;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      queueMicrotask(() => {
        if (!root.isConnected) return;
        if (root.contains(document.activeElement)) return;
        root.focus();
      });
    };
    tile.addEventListener('pointerdown', onTilePointerDown);
    return () => tile.removeEventListener('pointerdown', onTilePointerDown);
  }, []);

  // ---- Compose a Tweaks-shaped object for LogList ------------------------
  // LogList's API takes the global Tweaks; per-tile settings override the
  // overridable subset. Density still comes from the global tweak (it's
  // a dashboard-wide preference today; the modal could promote it to a
  // per-tile field in a follow-up).
  const effectiveTweaks: Tweaks = useMemo(
    () => ({
      ...tweaks,
      showTimestamps: settings.showTimestamp,
      showPid: settings.showPid,
      showProcess: settings.showProcess,
      showTag: settings.showTag,
      showLevel: settings.showLevel,
      wrapLines: settings.wrap,
      showHeatmap: settings.heatmap,
    }),
    [tweaks, settings],
  );

  const bumpActive = useCallback(() => {
    setActive(true);
    if (activeTimerRef.current != null) {
      window.clearTimeout(activeTimerRef.current);
    }
    activeTimerRef.current = window.setTimeout(() => {
      setActive(false);
      activeTimerRef.current = null;
    }, 1500);
  }, []);
  useEffect(
    () => () => {
      if (activeTimerRef.current != null) {
        window.clearTimeout(activeTimerRef.current);
      }
    },
    [],
  );

  if (!device) {
    return (
      <div className="lc-widget" style={{ padding: 16, color: 'var(--fg-3)' }}>
        Disconnected.
      </div>
    );
  }

  const widgetStyle: CSSProperties = {
    ['--widget-font-size' as string]: `${settings.fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className="lc-widget"
      ref={rootRef}
      tabIndex={-1}
      onMouseDown={onMouseDownWidget}
      onMouseMove={bumpActive}
      onMouseLeave={() => setActive(false)}
      onWheel={bumpActive}
      onScrollCapture={bumpActive}
      data-density={settings.density}
      data-active={active ? 'true' : 'false'}
      style={widgetStyle}
    >
      <FilterBar
        filters={filters}
        setFilters={setFiltersBoth}
        onlyMatches={onlyMatches}
        setOnlyMatches={onToggleOnlyMatches}
        knownProcesses={knownProcesses}
        knownTags={knownTags}
        paused={paused}
        setPaused={setPaused}
        onClear={onClear}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        wrapLines={settings.wrap}
        setWrapLines={(v) => setSettings({ wrap: v })}
        onExport={onExport}
        registerFocusHandler={(fn) => {
          focusFilterRef.current = fn;
        }}
        activeFilterId={activeFilterId}
        setActiveFilterId={setActiveFilterId}
        currentMatch={currentMatchIndex >= 0 ? currentMatchIndex + 1 : 0}
        matchCount={matchEntryIds.length}
        onAdvanceMatch={onAdvanceMatch}
        onRetreatMatch={onRetreatMatch}
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
        showTimestamps={settings.showTimestamp}
        setShowTimestamps={(v) => setSettings({ showTimestamp: v })}
        showPid={settings.showPid}
        setShowPid={(v) => setSettings({ showPid: v })}
        showProcess={settings.showProcess}
        setShowProcess={(v) => setSettings({ showProcess: v })}
        showTag={settings.showTag}
        setShowTag={(v) => setSettings({ showTag: v })}
        showLevel={settings.showLevel}
        setShowLevel={(v) => setSettings({ showLevel: v })}
      />

      <div className="log-area">
        {settings.heatmap && (
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
          pinned={pinned}
          pinnedEntries={pinnedEntries}
          onTogglePin={togglePin}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          crashHeads={crashHeads}
          tweaks={effectiveTweaks}
          autoScroll={autoScroll}
          setAutoScroll={setAutoScroll}
          deviceModel={device.model}
          hasFilters={filters.length > 0}
          activeMatchId={activeMatchId}
          onSelectRow={onSelectRow}
          registerScrollToTs={(fn) => {
            scrollToTsRef.current = fn;
          }}
          registerScrollToId={(fn) => {
            scrollToIdRef.current = fn;
          }}
          registerPreserveActivePosition={(fn) => {
            preserveActivePositionRef.current = fn;
          }}
        />
      </div>

      {!autoScroll && active && (
        <button
          className="scroll-to-bottom lc-resume"
          onClick={() => setAutoScroll(true)}
        >
          <Icons.Down size={13} /> Resume tail
        </button>
      )}
    </div>
  );
}

/** Read the hub's effective cap. Avoids importing the constant directly. */
function hubCap(_hub: unknown): number {
  return 50_000;
}

function closestCrashHead(entry: LogEntry, logs: LogEntry[], heads: Set<number>): number {
  const idx = logs.findIndex((l) => l.id === entry.id);
  for (let i = idx; i >= 0; i--) {
    if (heads.has(logs[i].id)) return logs[i].id;
  }
  return -1;
}

function formatExportLine(e: LogEntry): string {
  const d = new Date(e.ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts =
    `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  const pid = String(e.pid).padStart(5, ' ');
  const tid = String(e.tid).padStart(5, ' ');
  return `${ts} ${pid} ${tid} ${e.level} ${e.tag}: ${e.message}`;
}

function formatExportStamp(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function slimToFull(slim: ReadonlyArray<{ type: Filter['type']; value: string }>): Filter[] {
  const out: Filter[] = [];
  for (const s of slim) {
    const input = s.type === 'message' ? s.value : `${s.type}:${s.value}`;
    const f = makeFilter(input);
    if (f) out.push(f);
  }
  return out;
}

function sameSlim(
  full: Filter[],
  slim: ReadonlyArray<{ type: Filter['type']; value: string }>,
): boolean {
  if (full.length !== slim.length) return false;
  for (let i = 0; i < full.length; i++) {
    if (full[i].type !== slim[i].type || full[i].value !== slim[i].value) return false;
  }
  return true;
}
