// Root of WebLogcat. Owns top-level state, the stream subscription, and
// keyboard shortcuts. Component tree:
//
//   <App>
//     <EmptyState />          (when not connected)
//     <Toolbar />             |
//     <FilterBar />           |
//     <LevelRow />            | when connected
//     <LogList />             |
//     <Heatmap /> (optional)  |
//     <SettingsPanel />, <SearchOverlay />
//
// This file is the canonical "next thing to flesh out" entry point. The
// state shape, effect placement, and keyboard map are intended to stay —
// children should be filled in piecewise.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './EmptyState';
import { Toolbar } from './Toolbar';
import { FilterBar } from './FilterBar';
import { LevelRow } from './LevelRow';
import { LogList } from './LogList';
import { SettingsPanel } from './SettingsPanel';
import { SearchOverlay } from './SearchOverlay';
import { entryMatches, makeFilter } from '../lib/filters';
import { generateBatch, seedHistory } from '../lib/logGenerator';
import { useTweaks } from '../lib/tweaks';
import type { DeviceInfo, Filter, LogEntry, LogLevel, LevelEnabled } from '../types';

const MAX_LOGS = 5000;

const FAKE_DEVICE: DeviceInfo = {
  serial: 'FAKE0001',
  model: 'Pixel 8 (simulated)',
  androidVersion: '14',
  fake: true,
};

export function App() {
  const { tweaks, update: setTweaks } = useTweaks();

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [usingFake, setUsingFake] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [levelEnabled, setLevelEnabled] = useState<LevelEnabled>({
    V: true,
    D: true,
    I: true,
    W: true,
    E: true,
  });
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ---- Streaming ------------------------------------------------------------
  // While connected, push batches into `logs` (capped at MAX_LOGS).
  // For now this is the simulator; real ADB transport will share this state
  // shape — see src/lib/adb.ts.
  useEffect(() => {
    if (!device) return;
    if (!usingFake) {
      // TODO(sonnet): subscribe to the real ADB stream here.
      return;
    }
    setLogs(seedHistory(60, 4));
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

  // ---- Derived view --------------------------------------------------------
  const visibleLogs = useMemo(() => {
    let out = logs.filter((e) => levelEnabled[e.level]);
    if (onlyMatches && filters.length > 0) {
      out = out.filter((e) => entryMatches(e, filters).length > 0);
    }
    return out;
  }, [logs, levelEnabled, onlyMatches, filters]);

  const rate = useMemo(() => {
    const cutoff = Date.now() - 1000;
    return logs.reduce((n, e) => (e.ts >= cutoff ? n + 1 : n), 0);
  }, [logs]);

  // ---- Handlers ------------------------------------------------------------
  const connectFake = useCallback(() => {
    setDevice(FAKE_DEVICE);
    setUsingFake(true);
  }, []);

  const connectReal = useCallback(() => {
    // TODO(sonnet): call lib/adb.ts → connectDevice. For now, show the
    // user that real ADB is not ready and offer simulated data.
    alert('Real ADB transport is not wired up yet. Use simulated data for now.');
  }, []);

  const togglePin = useCallback((id: number) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleLevel = useCallback((lvl: LogLevel) => {
    setLevelEnabled((prev) => ({ ...prev, [lvl]: !prev[lvl] }));
  }, []);

  const soloLevel = useCallback((lvl: LogLevel) => {
    setLevelEnabled(() => {
      const next = { V: false, D: false, I: false, W: false, E: false } as LevelEnabled;
      next[lvl] = true;
      return next;
    });
  }, []);

  const addFilter = useCallback((raw: string) => {
    const f = makeFilter(raw);
    if (f) setFilters((prev) => [...prev, f]);
  }, []);

  const removeFilter = useCallback((id: number) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setPinned(new Set());
  }, []);

  // ---- Keyboard shortcuts --------------------------------------------------
  useEffect(() => {
    if (!device) return;
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inEditable =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (cmd && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (cmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        clearLogs();
        return;
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        return;
      }
      if (inEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === '/') {
        e.preventDefault();
        // TODO(sonnet): focus the filter chip input.
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [device, clearLogs]);

  // ---- Render --------------------------------------------------------------
  if (!device) {
    return <EmptyState onConnect={connectReal} onUseSimulated={connectFake} />;
  }

  const exportLogs = () => {
    const text = visibleLogs
      .map((e) => `${new Date(e.ts).toISOString()} ${e.pid}-${e.tid} ${e.level} ${e.tag}: ${e.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logcat-${device.serial}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="root">
      <Toolbar
        device={device}
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={exportLogs}
        onToggleTheme={() => setTweaks({ theme: tweaks.theme === 'dark' ? 'light' : 'dark' })}
      />
      <FilterBar
        filters={filters}
        onAddFilter={addFilter}
        onRemoveFilter={removeFilter}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onClear={clearLogs}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll((a) => !a)}
        onlyMatches={onlyMatches}
        onToggleOnlyMatches={() => setOnlyMatches((m) => !m)}
      />
      <LevelRow
        enabled={levelEnabled}
        onToggle={toggleLevel}
        onSolo={soloLevel}
        rate={rate}
        filteredCount={visibleLogs.length}
        totalCount={logs.length}
        pinnedCount={pinned.size}
        onClearPinned={() => setPinned(new Set())}
        paused={paused}
      />
      <LogList
        entries={visibleLogs}
        filters={filters}
        pinned={pinned}
        onTogglePin={togglePin}
        tweaks={tweaks}
        autoScroll={autoScroll}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tweaks={tweaks}
        onChange={setTweaks}
      />
      <SearchOverlay
        open={searchOpen}
        query={search}
        matchCount={0}
        onChange={setSearch}
        onClose={() => setSearchOpen(false)}
      />
      {usingFake && <div className="fake-badge">Simulated log stream</div>}
      {/* TODO(sonnet): "Resume tail" pill when scrolled up */}
      {/* TODO(sonnet): toast notifications */}
    </div>
  );
}
