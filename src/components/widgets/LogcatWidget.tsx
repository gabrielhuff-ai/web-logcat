// Logcat widget — the entire v1 logcat experience scoped to one tile.
//
// Per-tile settings (font size, density, heatmap, wrap, column toggles,
// level toggles, filters, autoScroll, paused) live in `useTileSettings`
// and are shared with the per-widget settings modal. Bar controls and
// modal controls write through the same setter — single source of truth.
// Ephemeral state (logs, pinned, search overlay) stays on local
// `useState`.
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
  type CSSProperties,
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
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [onlyMatches, setOnlyMatches] = useState(false);
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
  }, [searchOpen, onClear, setPaused]);

  const onMouseDownWidget = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    const tgt = e.target as HTMLElement;
    if (!root || root.contains(document.activeElement)) return;
    if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
    root.focus();
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
      data-density={settings.density}
      style={widgetStyle}
    >
      <FilterBar
        filters={filters}
        setFilters={setFiltersBoth}
        onlyMatches={onlyMatches}
        setOnlyMatches={setOnlyMatches}
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
          search={search}
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

/** Read the hub's effective cap. Avoids importing the constant directly. */
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
