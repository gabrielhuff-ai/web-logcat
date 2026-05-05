// Logcat widget — wraps the existing logcat UI as a dashboard widget.
// Self-contained state: each instance has its own paused/filters/logs.

function LogcatWidget({ device, initial, tweaks, setTweak }) {
  const [paused, setPaused] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [filters, setFilters] = React.useState(initial?.filters || []);
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [onlyMatches, setOnlyMatches] = React.useState(false);
  const [levelEnabled, setLevelEnabled] = React.useState({ V: true, D: true, I: true, W: true, E: true });
  const [pinned, setPinned] = React.useState(new Set());
  const [expanded, setExpanded] = React.useState(new Set());
  const [logs, setLogs] = React.useState(() => window.LogGen.seedHistory(60, 4));
  const [rate, setRate] = React.useState(0);

  const speed = tweaks?.streamingSpeed ?? 1.0;
  const showTimestamps = tweaks?.showTimestamps ?? true;
  const showPid = tweaks?.showPid ?? false;
  const wrapLines = tweaks?.wrapLines ?? false;
  const showHeatmap = tweaks?.showHeatmap ?? false;
  const density = tweaks?.density ?? "cozy";

  React.useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      const batch = window.LogGen.generateBatch(Date.now(), speed);
      setLogs((prev) => {
        const next = [...prev, ...batch];
        if (next.length > 5000) return next.slice(next.length - 5000);
        return next;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [paused, speed]);

  React.useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - 1000;
      setRate(logs.filter(l => l.ts >= cutoff).length);
    }, 500);
    return () => clearInterval(t);
  }, [logs]);

  const onClear = () => { setLogs([]); setPinned(new Set()); setExpanded(new Set()); };

  const knownProcesses = React.useMemo(() => {
    const s = new Set(window.LogGen.PROCESSES.map(p => p.pkg));
    logs.forEach(l => s.add(l.pkg));
    return [...s].sort();
  }, [logs]);
  const knownTags = React.useMemo(() => {
    const s = new Set();
    Object.values(window.LogGen.TAG_POOL).forEach(arr => arr.forEach(t => s.add(t)));
    logs.forEach(l => s.add(l.tag));
    return [...s].sort();
  }, [logs]);

  const crashHeads = React.useMemo(() => {
    const heads = new Set();
    let prev = false;
    for (const e of logs) {
      if (e.isCrashLine && !prev) heads.add(e.id);
      prev = !!e.isCrashLine;
    }
    return heads;
  }, [logs]);

  const filtered = React.useMemo(() => {
    return logs.filter(e => {
      if (!levelEnabled[e.level]) return false;
      if (e.isCrashLine && !crashHeads.has(e.id) && !expanded.has(closestCrashHead(e, logs, crashHeads))) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!e.message.toLowerCase().includes(s) && !e.tag.toLowerCase().includes(s) && !e.pkg.toLowerCase().includes(s)) return false;
      }
      if (onlyMatches && filters.length > 0) {
        if (!Filters.entryMatches(e, filters).length) return false;
      }
      return true;
    });
  }, [logs, levelEnabled, search, onlyMatches, filters, expanded, crashHeads]);

  const buckets = React.useMemo(() => {
    const now = Date.now();
    const out = [];
    for (let i = 59; i >= 0; i--) {
      const start = now - (i + 1) * 1000;
      const end = now - i * 1000;
      const bin = logs.filter(l => l.ts >= start && l.ts < end);
      const counts = { V: 0, D: 0, I: 0, W: 0, E: 0 };
      bin.forEach(l => counts[l.level]++);
      let dominant = "I";
      if (counts.E > 0) dominant = "E";
      else if (counts.W > 1) dominant = "W";
      else { let best = -1; for (const k of ["I", "D", "V"]) if (counts[k] > best) { best = counts[k]; dominant = k; } }
      out.push({ count: bin.length, dominant, secondsAgo: i });
    }
    return out;
  }, [logs]);

  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoScroll]);
  const onScroll = (e) => {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist > 60 && autoScroll) setAutoScroll(false);
    if (dist < 4 && !autoScroll) setAutoScroll(true);
  };

  const togglePin = (id) => setPinned(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="lc-widget">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onlyMatches={onlyMatches}
        setOnlyMatches={setOnlyMatches}
        knownProcesses={knownProcesses}
        knownTags={knownTags}
        paused={paused} setPaused={setPaused}
        onClear={onClear}
        autoScroll={autoScroll} setAutoScroll={setAutoScroll}
        showTimestamps={showTimestamps} setShowTimestamps={(v) => setTweak?.("showTimestamps", v)}
        showPid={showPid} setShowPid={(v) => setTweak?.("showPid", v)}
        wrapLines={wrapLines} setWrapLines={(v) => setTweak?.("wrapLines", v)}
      />

      <div className="lvl-bar">
        <LevelFilter enabled={levelEnabled} setEnabled={setLevelEnabled} />
        <div className="lvl-spacer" />
        <span className="lvl-stats">
          <span className="rate-dot" data-pulse={rate > 0} />
          <span>{rate}/s</span>
          <span className="rate-sep">·</span>
          <span>{filtered.length.toLocaleString()} of {logs.length.toLocaleString()}</span>
        </span>
        {pinned.size > 0 && (
          <div className="pin-summary">
            <Icons.PinFilled size={11} /> {pinned.size} pinned
            <button className="pin-clear" onClick={() => setPinned(new Set())}>clear</button>
          </div>
        )}
      </div>

      <div className="log-area">
        {showHeatmap && (
          <Heatmap buckets={buckets} currentSecond={59} onJumpToSecond={() => {}} />
        )}
        <div className="log-scroll" ref={scrollRef} onScroll={onScroll}>
          {filtered.length === 0 && (
            <div className="empty-logs">
              <Icons.Filter size={20} />
              <div>No matching log lines</div>
              <div className="empty-logs-hint">
                {filters.length > 0 ? "Try removing some filters or toggle off 'Only matches'" : "Waiting for logs from " + (device?.label || "device")}
              </div>
            </div>
          )}
          {pinned.size > 0 && (
            <div className="pinned-block">
              <div className="pinned-head">PINNED</div>
              {logs.filter(l => pinned.has(l.id)).map(l => (
                <LogRow
                  key={"pin-" + l.id} entry={l} filters={filters} search={search}
                  showTimestamps={showTimestamps} showPid={showPid}
                  wrapLines={wrapLines} density={density}
                  pinned onTogglePin={() => togglePin(l.id)}
                  isMatch={Filters.entryMatches(l, filters).length > 0}
                  onlyMatches={onlyMatches}
                  isCrashHead={crashHeads.has(l.id)}
                  expanded={expanded.has(l.id)}
                  onToggleExpand={() => toggleExpand(l.id)}
                />
              ))}
            </div>
          )}
          {filtered.map(l => (
            <LogRow
              key={l.id} entry={l} filters={filters} search={search}
              showTimestamps={showTimestamps} showPid={showPid}
              wrapLines={wrapLines} density={density}
              pinned={pinned.has(l.id)} onTogglePin={() => togglePin(l.id)}
              isMatch={Filters.entryMatches(l, filters).length > 0}
              onlyMatches={onlyMatches}
              isCrashHead={crashHeads.has(l.id)}
              expanded={expanded.has(l.id)}
              onToggleExpand={() => toggleExpand(l.id)}
            />
          ))}
        </div>
      </div>

      {!autoScroll && (
        <button className="lc-resume" onClick={() => { setAutoScroll(true); }}>
          <Icons.Down size={13} /> Resume tail
        </button>
      )}

      <style>{`
        .lc-widget {
          display: flex; flex-direction: column;
          flex: 1; min-height: 0;
          position: relative;
        }
        .lc-widget .log-area { flex: 1; min-height: 0; }
        .lc-resume {
          position: absolute; bottom: 12px; left: 50%;
          transform: translateX(-50%);
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px;
          background: var(--accent);
          color: white;
          border-radius: 999px;
          font-size: var(--t-xs);
          box-shadow: var(--shadow-2);
          z-index: 4;
        }
      `}</style>
    </div>
  );
}

function closestCrashHead(entry, logs, heads) {
  const idx = logs.findIndex(l => l.id === entry.id);
  for (let i = idx; i >= 0; i--) {
    if (heads.has(logs[i].id)) return logs[i].id;
  }
  return -1;
}

window.LogcatWidget = LogcatWidget;
