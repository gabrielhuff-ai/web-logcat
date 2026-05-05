// Root of WebLogcat. Owns top-level state, the stream subscription, and
// keyboard shortcuts. State shape mirrors design/source/app.jsx.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EmptyState } from './EmptyState';
import { Toolbar } from './Toolbar';
import { FilterBar } from './FilterBar';
import { LevelRow } from './LevelRow';
import { LogList } from './LogList';
import { Heatmap, type HeatmapBucket } from './Heatmap';
import { SettingsPanel } from './SettingsPanel';
import { SearchOverlay } from './SearchOverlay';
import { HelpDialog } from './HelpDialog';
import * as Icons from './Icons';
import { entryMatches, makeFilter } from '../lib/filters';
import { KNOWN_PROCESSES, KNOWN_TAGS } from '../lib/knownNames';
// `lib/logGenerator` is dynamic-imported on demand inside connectFake
// — see SimulatorAPI below — so the simulator code (~10 KB minified) is
// only fetched when the user actually opts into fake data.
type SimulatorAPI = typeof import('../lib/logGenerator');
// Type-only import: keeps the yume-chan ADB client + WebCrypto out of
// the initial bundle. The runtime module is imported lazily inside
// `connectReal` below so the empty-state landing page and the simulator
// path don't pay for it.
import type { LogStream } from '../lib/adb';
import type { ConnectStep } from './EmptyState';
import { useTweaks } from '../lib/tweaks';
import type {
  DeviceInfo,
  Filter,
  LevelEnabled,
  LogEntry,
  LogLevel,
} from '../types';
import { formatTs } from '../lib/format';

// Soft cap: while auto-tailing the user is "looking at the present", so
// FIFO-trim aggressively to keep memory bounded.
const MAX_LOGS = 5000;
// Hard cap: while scroll-locked we accumulate, so the user can scroll up
// without rows being yanked out from under their viewport. Cuts in only
// to prevent runaway memory if the user leaves the tab idle for hours.
// At ~200 B/row, 50k rows ≈ 10 MB.
const MAX_LOGS_HARD = 50_000;
// Batch ingest into setLogs at most once every FLUSH_MS to avoid 200+
// re-renders per second on real-device streams.
const FLUSH_MS = 100;

const FAKE_DEVICE: DeviceInfo = {
  serial: 'fake-device-001',
  model: 'Demo Device',
  androidVersion: '14',
  fake: true,
};

export function App() {
  const { tweaks, update: setTweaks } = useTweaks();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [usingFake, setUsingFake] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [rate, setRate] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Mirror autoScroll into a ref so the streaming closures can read its
  // current value synchronously (without re-creating intervals on every
  // toggle). The trim policy below depends on this.
  //
  // Use a wrapper setter to keep the ref in lock-step with the state
  // *synchronously* — the useEffect mirror would lag by one frame, and
  // a buffer flush in that window would trim with the stale value.
  const autoScrollRef = useRef(autoScroll);
  const setAutoScrollSafe = useCallback((v: boolean) => {
    autoScrollRef.current = v;
    setAutoScroll(v);
  }, []);

  const realStreamRef = useRef<LogStream | null>(null);

  // ---- Scroll anchoring on head trim --------------------------------------
  // While scroll-locked, when the FIFO trim evicts entries from the head of
  // the buffer, the rows above the user's viewport disappear, which would
  // make their viewport "scroll forward" through the content. We compensate
  // by subtracting (rowsRemovedFromVisibleList × rowHeight) from scrollTop
  // in a layout effect, so the rows the user is actually reading stay
  // anchored at their on-screen position until the user themselves scrolls
  // off them or the buffer hard-cap finally evicts them.
  //
  // `visibleIdsRef` mirrors the current `filtered` list's id set, so we can
  // count "of the entries we're about to evict, how many were on screen?"
  // without re-running the filter predicate (which depends on logs ordering
  // for crash-group expansion).
  const visibleIdsRef = useRef<Set<number>>(new Set());

  // `compensateScrollRef` is the imperative callback LogList registers
  // for "the FIFO trim just evicted N visible rows; anchor scrollTop
  // accordingly". We invoke it synchronously in flushIncoming, *before*
  // setLogs, so the virtualiser reads the new scrollTop on the first
  // render that has the new entries — items at their paddingTop offsets
  // line up with the user's scroll position with no intermediate paint.
  // The pixel-per-row math happens inside LogList where we can use the
  // virtualiser's measured average (matters in wrap mode).
  const compensateScrollRef = useRef<((rowsTrimmed: number) => void) | null>(null);

  // ---- Ingest batching ----------------------------------------------------
  // Real devices can emit hundreds of lines per second. Calling setLogs
  // per line burns frames re-copying the array. Instead, accumulate into
  // a ref and flush at most every FLUSH_MS.
  const incomingRef = useRef<LogEntry[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  const flushIncoming = useCallback(() => {
    flushTimerRef.current = null;
    const batch = incomingRef.current;
    if (batch.length === 0) return;
    incomingRef.current = [];

    // Compute the trim + anchor math against `logsRef.current` (kept in
    // sync with `logs` via a useEffect below) so we can call the
    // compensate callback *before* setLogs is queued. Doing it before
    // setLogs is critical: the virtualiser reads scrollTop during render,
    // so it needs the new value in place by the time React processes our
    // setLogs and re-renders LogList.
    const prev = logsRef.current;
    const next = prev.concat(batch);
    const cap = autoScrollRef.current ? MAX_LOGS : MAX_LOGS_HARD;
    if (next.length > cap) {
      const removeCount = next.length - cap;
      if (!autoScrollRef.current) {
        const visible = visibleIdsRef.current;
        let trimmedVisible = 0;
        for (let i = 0; i < removeCount; i++) {
          if (visible.has(next[i].id)) trimmedVisible++;
        }
        if (trimmedVisible > 0) {
          compensateScrollRef.current?.(trimmedVisible);
        }
      }
      next.splice(0, removeCount);
    }
    setLogs(next);
  }, []);

  const queueEntries = useCallback(
    (entries: LogEntry[]) => {
      if (pausedRef.current || entries.length === 0) return;
      incomingRef.current.push(...entries);
      if (flushTimerRef.current == null) {
        flushTimerRef.current = window.setTimeout(flushIncoming, FLUSH_MS);
      }
    },
    [flushIncoming],
  );

  const resetIngest = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    incomingRef.current = [];
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  // Holds the lazy-loaded simulator module. Populated by connectFake;
  // the streaming effect below reads `generateBatch` through this ref so
  // the static import isn't required.
  const simulatorRef = useRef<SimulatorAPI | null>(null);

  // ---- Streaming: simulator (real ADB stream is in `connectReal`) ---------
  useEffect(() => {
    if (!device || !usingFake) return;
    const interval = window.setInterval(() => {
      const sim = simulatorRef.current;
      if (!sim) return;
      queueEntries(sim.generateBatch(Date.now(), tweaks.streamingSpeed));
    }, 600);
    return () => window.clearInterval(interval);
  }, [device, usingFake, tweaks.streamingSpeed, queueEntries]);

  // Auto-toggle "only matches" when the user adds the first filter (and
  // back off when they remove the last one). Rationale: if a user has
  // gone to the trouble of typing a filter, what they almost always want
  // is to see only the matching rows, not just have them highlighted in
  // a sea of others. They can still toggle the icon manually any time;
  // this effect only fires on the 0↔︎N+ boundary so it doesn't fight
  // explicit user choices once filters exist.
  const prevFilterCountRef = useRef(filters.length);
  useEffect(() => {
    const prev = prevFilterCountRef.current;
    const curr = filters.length;
    if (prev === 0 && curr > 0) setOnlyMatches(true);
    else if (prev > 0 && curr === 0) setOnlyMatches(false);
    prevFilterCountRef.current = curr;
  }, [filters.length]);

  // ---- Filter persistence -------------------------------------------------
  // Stored per device serial under `weblogcat:filters:<serial>` so a
  // developer who comes back to the same physical device gets their
  // chip-bar back. We re-derive each filter through `makeFilter` on load
  // so the in-session id counter stays consistent (otherwise the next
  // chip the user adds would collide with a persisted id).
  useEffect(() => {
    if (!device) return;
    const key = `weblogcat:filters:${device.serial}`;
    let parsed: Array<{ type: string; value: string }>;
    try {
      const raw = localStorage.getItem(key);
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
    // Run when device changes — load happens once per connection.
  }, [device]);

  useEffect(() => {
    if (!device) return;
    const key = `weblogcat:filters:${device.serial}`;
    try {
      // Persist only the user-meaningful fields (type + value); ids and
      // colors get re-derived on next load through makeFilter.
      const slim = filters.map(({ type, value }) => ({ type, value }));
      localStorage.setItem(key, JSON.stringify(slim));
    } catch {
      // Quota / privacy mode — silently ignore.
    }
  }, [device, filters]);

  // Live rate (logs/second) recomputed every 500ms.
  // Read `logs` through a ref so the interval doesn't get torn down and
  // re-created on every ingest tick — at FLUSH_MS=100 the previous
  // [device, logs] dependency rebuilt the interval ~10×/s for no reason.
  // Also used by flushIncoming below to compute the trim+anchor math
  // sequentially, *outside* the React render cycle.
  const logsRef = useRef(logs);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  useEffect(() => {
    if (!device) return;
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
  }, [device]);

  // ---- Connection handlers ------------------------------------------------
  const connectFake = useCallback(async () => {
    resetIngest();
    // Lazy-load the simulator the first time the user opts into fake
    // data. Cached on simulatorRef so subsequent reconnects (from
    // disconnect → fake-data again) don't re-fetch the chunk.
    if (!simulatorRef.current) {
      simulatorRef.current = await import('../lib/logGenerator');
    }
    const sim = simulatorRef.current;
    setLogs(sim.seedHistory(60, 5));
    setDevice(FAKE_DEVICE);
    setDevices([FAKE_DEVICE]);
    setUsingFake(true);
    showToast('Using simulated log data');
  }, [resetIngest, showToast]);

  const connectReal = useCallback(
    async (setStep?: (step: ConnectStep) => void) => {
      try {
        // Lazy-load the ADB transport (which pulls in @yume-chan/adb
        // + WebCrypto, ~140 KB minified) only when the user actually
        // initiates a real connect. The simulator + landing page stay
        // in the initial bundle.
        const { connectDevice } = await import('../lib/adb');
        const result = await connectDevice({
          onEntry: (e) => queueEntries([e]),
          onError: (err) => showToast(err.message),
          onPhase: (phase) => {
            if (phase === 'requesting') setStep?.(1);
            else if (phase === 'authenticating') setStep?.(2);
            else if (phase === 'connected') setStep?.(3);
          },
          onDisconnect: () => {
            resetIngest();
            realStreamRef.current = null;
            setDevice(null);
            setDevices([]);
            setLogs([]);
            showToast('Device disconnected');
          },
        });
        realStreamRef.current = result.stream;
        setDevice(result.device);
        setDevices([result.device]);
        setUsingFake(false);
        showToast(`Connected to ${result.device.model}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to connect';
        showToast(msg);
        // Re-throw so EmptyState can reset its button state.
        throw err;
      }
    },
    [queueEntries, resetIngest, showToast],
  );

  const onDisconnect = useCallback(() => {
    void realStreamRef.current?.stop();
    realStreamRef.current = null;
    resetIngest();
    setDevice(null);
    setDevices([]);
    setLogs([]);
    setUsingFake(false);
  }, [resetIngest]);

  // Pair new device: tear down the current stream so the WebUSB chooser
  // can claim a different device, then run the standard connect flow.
  // If the user cancels the chooser they're left in the empty state and
  // can hit "Connect a device" from there.
  const onPairNew = useCallback(async () => {
    onDisconnect();
    try {
      await connectReal();
    } catch {
      // already toasted by connectReal; nothing more to do here.
    }
  }, [onDisconnect, connectReal]);

  const switchDevice = useCallback(
    (d: DeviceInfo) => {
      setDevice(d);
      setUsingFake(d.fake === true);
      showToast(`Switched to ${d.model}`);
    },
    [showToast],
  );

  // ---- Derived data -------------------------------------------------------
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

  // Mirror the visible list's id set into a ref so the trim-anchor math
  // in flushIncoming (above) can answer "of the entries we're trimming,
  // how many were on screen?" synchronously, without re-running the full
  // filter predicate (which depends on logs ordering for crash groups).
  useEffect(() => {
    const set = new Set<number>();
    for (const e of filtered) set.add(e.id);
    visibleIdsRef.current = set;
  }, [filtered]);

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

  // ---- Handlers (memoised) ------------------------------------------------
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

  const onClear = useCallback(() => {
    resetIngest();
    setLogs([]);
    setPinned(new Set());
    setExpanded(new Set());
    showToast('Logs cleared');
  }, [resetIngest, showToast]);

  const onExport = useCallback(() => {
    if (!device) return;
    const text = filtered
      .map(
        (e) =>
          `${formatTs(e.ts)} ${e.pid}-${e.tid} ${e.pkg} ${e.tag} ${e.level}: ${e.message}`,
      )
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logcat-${device.serial}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length.toLocaleString()} lines`);
  }, [device, filtered, showToast]);

  // Imperative refs registered by children.
  const focusFilterRef = useRef<(() => void) | null>(null);
  const scrollToTsRef = useRef<((ts: number) => void) | null>(null);

  // ---- Keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    if (!device) return;
    const onKey = (e: KeyboardEvent) => {
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
      if (e.key === '?' && !inField) {
        e.preventDefault();
        setHelpOpen((v) => !v);
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
  }, [device, searchOpen, onClear]);

  // ---- Render -------------------------------------------------------------
  if (!device) {
    return <EmptyState onConnect={connectReal} onUseFakeData={connectFake} />;
  }

  return (
    <div className="root">
      <Toolbar
        device={device}
        devices={devices.length ? devices : [device]}
        onSwitchDevice={switchDevice}
        onDisconnect={onDisconnect}
        onPairNew={onPairNew}
        onExport={onExport}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={tweaks.theme}
        onSetTheme={(t) => {
          setTweaks({ theme: t });
          showToast(t === 'dark' ? 'Dark mode' : 'Light mode');
        }}
      />

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
        setAutoScroll={setAutoScrollSafe}
        showTimestamps={tweaks.showTimestamps}
        setShowTimestamps={(v) => setTweaks({ showTimestamps: v })}
        showPid={tweaks.showPid}
        setShowPid={(v) => setTweaks({ showPid: v })}
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
          setAutoScroll={setAutoScrollSafe}
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
        <button className="scroll-to-bottom" onClick={() => setAutoScrollSafe(true)}>
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

      {usingFake && (
        <div className="fake-badge">
          <Icons.Wand size={11} /> Simulated log stream
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tweaks={tweaks}
        onChange={setTweaks}
      />

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function closestCrashHead(entry: LogEntry, logs: LogEntry[], heads: Set<number>): number {
  // Find the index of `entry`, then walk backwards to the nearest crash head.
  const idx = logs.findIndex((l) => l.id === entry.id);
  for (let i = idx; i >= 0; i--) {
    if (heads.has(logs[i].id)) return logs[i].id;
  }
  return -1;
}
