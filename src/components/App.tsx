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
import { Heatmap, Scrubber, type HeatmapBucket } from './Heatmap';
import { SettingsPanel } from './SettingsPanel';
import { SearchOverlay } from './SearchOverlay';
import * as Icons from './Icons';
import { entryMatches } from '../lib/filters';
import {
  KNOWN_PROCESSES,
  KNOWN_TAGS,
  generateBatch,
  seedHistory,
} from '../lib/logGenerator';
import { connectDevice, type LogStream } from '../lib/adb';
import type { ConnectStep } from './EmptyState';
import { useTweaks } from '../lib/tweaks';
import type {
  DeviceInfo,
  Filter,
  LevelEnabled,
  LogEntry,
  LogLevel,
} from '../types';
import { formatTs, rowHeightFor } from '../lib/format';

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

  // `compensationRef` is shared with LogList: App writes pending pixel
  // deltas, LogList consumes them in a useLayoutEffect that runs after the
  // DOM has been resized but before paint.
  const compensationRef = useRef(0);

  const rowHeightRef = useRef(rowHeightFor(tweaks.density));
  useEffect(() => {
    rowHeightRef.current = rowHeightFor(tweaks.density);
  }, [tweaks.density]);

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

    // Capture how many of the about-to-be-evicted entries were visible to
    // the user, so we can anchor scrollTop after the trim.
    let trimmedVisible = 0;

    setLogs((prev) => {
      const next = prev.concat(batch);
      // Auto-tailing: trim to MAX_LOGS so the live view stays bounded.
      // Scroll-locked: keep up to MAX_LOGS_HARD so rows above the viewport
      // don't get evicted while the user is reading them.
      const cap = autoScrollRef.current ? MAX_LOGS : MAX_LOGS_HARD;
      if (next.length > cap) {
        const removeCount = next.length - cap;
        if (!autoScrollRef.current) {
          const visible = visibleIdsRef.current;
          for (let i = 0; i < removeCount; i++) {
            if (visible.has(next[i].id)) trimmedVisible++;
          }
        }
        next.splice(0, removeCount);
      }
      return next;
    });

    if (trimmedVisible > 0) {
      compensationRef.current += trimmedVisible * rowHeightRef.current;
    }
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

  // ---- Streaming: simulator (real ADB stream is in `connectReal`) ---------
  useEffect(() => {
    if (!device || !usingFake) return;
    const interval = window.setInterval(() => {
      queueEntries(generateBatch(Date.now(), tweaks.streamingSpeed));
    }, 600);
    return () => window.clearInterval(interval);
  }, [device, usingFake, tweaks.streamingSpeed, queueEntries]);

  // Live rate (logs/second) recomputed every 500ms.
  useEffect(() => {
    if (!device) return;
    const t = window.setInterval(() => {
      const cutoff = Date.now() - 1000;
      let n = 0;
      for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].ts < cutoff) break;
        n++;
      }
      setRate(n);
    }, 500);
    return () => window.clearInterval(t);
  }, [device, logs]);

  // ---- Connection handlers ------------------------------------------------
  const connectFake = useCallback(() => {
    resetIngest();
    setLogs(seedHistory(60, 5));
    setDevice(FAKE_DEVICE);
    setDevices([FAKE_DEVICE]);
    setUsingFake(true);
    showToast('Using simulated log data');
  }, [resetIngest, showToast]);

  const connectReal = useCallback(
    async (setStep?: (step: ConnectStep) => void) => {
      try {
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

  const onPairNew = useCallback(() => {
    showToast('Pair new device — not implemented yet');
  }, [showToast]);

  const onDisconnect = useCallback(() => {
    void realStreamRef.current?.stop();
    realStreamRef.current = null;
    resetIngest();
    setDevice(null);
    setDevices([]);
    setLogs([]);
    setUsingFake(false);
  }, [resetIngest]);

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
            currentSecond={59}
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
          compensationRef={compensationRef}
          registerScrollToTs={(fn) => {
            scrollToTsRef.current = fn;
          }}
        />
      </div>

      {tweaks.showScrubber && (
        <Scrubber
          buckets={buckets}
          viewportStart={0.85}
          viewportEnd={1.0}
          onScrub={() => {
            /* TODO: jump to scrubbed position once full timeline window is implemented */
          }}
          total={logs.length}
        />
      )}

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
