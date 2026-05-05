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
import { connectDevice } from '../lib/adb';
import { useTweaks } from '../lib/tweaks';
import type {
  DeviceInfo,
  Filter,
  LevelEnabled,
  LogEntry,
  LogLevel,
} from '../types';
import { formatTs } from '../lib/format';

const MAX_LOGS = 5000;

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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  // ---- Streaming: simulator (real ADB stream is in `connectReal`) ---------
  useEffect(() => {
    if (!device || !usingFake) return;
    const interval = window.setInterval(() => {
      if (pausedRef.current) return;
      const batch = generateBatch(Date.now(), tweaks.streamingSpeed);
      setLogs((prev) => {
        const next = prev.concat(batch);
        if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
        return next;
      });
    }, 600);
    return () => window.clearInterval(interval);
  }, [device, usingFake, tweaks.streamingSpeed]);

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
    setLogs(seedHistory(60, 5));
    setDevice(FAKE_DEVICE);
    setDevices([FAKE_DEVICE]);
    setUsingFake(true);
    showToast('Using simulated log data');
  }, [showToast]);

  const connectReal = useCallback(async () => {
    try {
      const result = await connectDevice({
        onEntry: (e) => {
          if (pausedRef.current) return;
          setLogs((prev) => {
            const next = prev.concat(e);
            if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
            return next;
          });
        },
        onError: (err) => showToast(err.message),
        onDisconnect: () => {
          setDevice(null);
          setDevices([]);
          setLogs([]);
          showToast('Device disconnected');
        },
      });
      setDevice(result.device);
      setDevices([result.device]);
      setUsingFake(false);
      showToast(`Connected to ${result.device.model}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      showToast(msg);
      throw err;
    }
  }, [showToast]);

  const onPairNew = useCallback(() => {
    showToast('Pair new device — not implemented yet');
  }, [showToast]);

  const onDisconnect = useCallback(() => {
    setDevice(null);
    setDevices([]);
    setLogs([]);
    setUsingFake(false);
  }, []);

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
    setLogs([]);
    setPinned(new Set());
    setExpanded(new Set());
    showToast('Logs cleared');
  }, [showToast]);

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
        setAutoScroll={setAutoScroll}
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
          setAutoScroll={setAutoScroll}
          deviceModel={device.model}
          hasFilters={filters.length > 0}
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
        <button className="scroll-to-bottom" onClick={() => setAutoScroll(true)}>
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
