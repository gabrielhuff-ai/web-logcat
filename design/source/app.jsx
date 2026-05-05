// WebLogcat — Main app

const DEVICES = [
  { serial: "RZ8N40ABCDE", model: "Pixel 8 Pro", android: "14", api: 34, status: "online" },
  { serial: "98765FAKE001", model: "Samsung Galaxy S24", android: "14", api: 34, status: "online" },
  { serial: "emulator-5554", model: "Pixel 7 Emulator", android: "13", api: 33, status: "online" },
];
const FAKE_DEVICE = { serial: "fake-device-001", model: "Demo Device", android: "14", api: 34, status: "fake" };

function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "dark",
    "accent": "indigo",
    "density": "cozy",
    "showTimestamps": true,
    "showPid": false,
    "wrapLines": false,
    "showHeatmap": false,
    "showScrubber": false,
    "streamingSpeed": 1.0
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [connected, setConnected] = React.useState(false);
  const [device, setDevice] = React.useState(DEVICES[0]);
  const [usingFake, setUsingFake] = React.useState(false);

  const [paused, setPaused] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [filters, setFilters] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [onlyMatches, setOnlyMatches] = React.useState(false);
  const [levelEnabled, setLevelEnabled] = React.useState({ V: true, D: true, I: true, W: true, E: true });
  const [pinned, setPinned] = React.useState(new Set());
  const [expanded, setExpanded] = React.useState(new Set());

  const [logs, setLogs] = React.useState([]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [rate, setRate] = React.useState(0);
  const [toast, setToast] = React.useState(null);

  // Live stream
  React.useEffect(() => {
    if (!connected || paused) return;
    const interval = setInterval(() => {
      const batch = window.LogGen.generateBatch(Date.now(), tweaks.streamingSpeed);
      setLogs((prev) => {
        const next = [...prev, ...batch];
        if (next.length > 5000) return next.slice(next.length - 5000);
        return next;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [connected, paused, tweaks.streamingSpeed]);

  React.useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - 1000;
      setRate(logs.filter(l => l.ts >= cutoff).length);
    }, 500);
    return () => clearInterval(t);
  }, [logs]);

  const onConnect = () => {
    setLogs(window.LogGen.seedHistory(60, 4));
    setConnected(true); setUsingFake(false); setDevice(DEVICES[0]);
    showToast("Connected to " + DEVICES[0].model);
  };
  const onUseFakeData = () => {
    setLogs(window.LogGen.seedHistory(60, 5));
    setConnected(true); setUsingFake(true); setDevice(FAKE_DEVICE);
    showToast("Using simulated log data");
  };
  const onDisconnect = () => { setConnected(false); setLogs([]); setUsingFake(false); };
  const onClear = () => { setLogs([]); setPinned(new Set()); setExpanded(new Set()); showToast("Logs cleared"); };
  const onExport = () => {
    const lines = filtered.map(formatExport).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `logcat-${device.serial}-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length.toLocaleString()} lines`);
  };
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

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

  React.useEffect(() => {
    const onKey = (e) => {
      const inField = e.target.tagName === "INPUT";
      if (e.code === "Space" && !inField) { e.preventDefault(); setPaused(p => !p); }
      if (e.key === "/" && !inField) { e.preventDefault(); document.querySelector(".fb-input")?.focus(); }
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => document.querySelector(".search-overlay input")?.focus(), 50);
      }
      if (e.key === "Escape") {
        if (searchOpen) { setSearchOpen(false); setSearch(""); }
      }
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onClear(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

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

  React.useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    document.documentElement.dataset.accent = tweaks.accent;
  }, [tweaks.theme, tweaks.accent]);

  return (
    <div className="root">
      {!connected ? (
        <EmptyState onConnect={onConnect} onUseFakeData={onUseFakeData} />
      ) : (
        <>
          <Toolbar
            device={device}
            devices={usingFake ? [FAKE_DEVICE, ...DEVICES] : DEVICES}
            onSwitchDevice={(d) => { setDevice(d); setUsingFake(d.serial === FAKE_DEVICE.serial); showToast("Switched to " + d.model); }}
            onDisconnect={onDisconnect}
            onExport={onExport}
            onSettings={() => setSettingsOpen(true)}
            theme={tweaks.theme}
            setTheme={(v) => { setTweak("theme", v); showToast(v === "dark" ? "Dark mode" : "Light mode"); }}
          />

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
            showTimestamps={tweaks.showTimestamps} setShowTimestamps={(v) => setTweak("showTimestamps", v)}
            showPid={tweaks.showPid} setShowPid={(v) => setTweak("showPid", v)}
            wrapLines={tweaks.wrapLines} setWrapLines={(v) => setTweak("wrapLines", v)}
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
            {tweaks.showHeatmap && (
              <Heatmap
                buckets={buckets}
                currentSecond={59}
                onJumpToSecond={(i) => {
                  const targetTs = Date.now() - (59 - i) * 1000;
                  const target = filtered.findIndex(l => l.ts >= targetTs);
                  if (target >= 0 && scrollRef.current) {
                    scrollRef.current.scrollTop = target * rowHeightFor(tweaks.density);
                    setAutoScroll(false);
                  }
                }}
              />
            )}
            <div className="log-scroll" ref={scrollRef} onScroll={onScroll}>
              {filtered.length === 0 && (
                <div className="empty-logs">
                  <Icons.Filter size={20} />
                  <div>No matching log lines</div>
                  <div className="empty-logs-hint">
                    {filters.length > 0 ? "Try removing some filters or toggle off 'Only matches'" : "Waiting for logs from " + device.model}
                  </div>
                </div>
              )}
              {pinned.size > 0 && (
                <div className="pinned-block">
                  <div className="pinned-head">PINNED</div>
                  {logs.filter(l => pinned.has(l.id)).map(l => (
                    <LogRow
                      key={"pin-" + l.id} entry={l} filters={filters} search={search}
                      showTimestamps={tweaks.showTimestamps} showPid={tweaks.showPid}
                      wrapLines={tweaks.wrapLines} density={tweaks.density}
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
                  showTimestamps={tweaks.showTimestamps} showPid={tweaks.showPid}
                  wrapLines={tweaks.wrapLines} density={tweaks.density}
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

          {tweaks.showScrubber && (
            <Scrubber buckets={buckets} viewportStart={0.85} viewportEnd={1.0} onScrub={() => {}} total={logs.length} />
          )}

          {!autoScroll && (
            <button className="scroll-to-bottom" onClick={() => { setAutoScroll(true); }}>
              <Icons.Down size={13} /> Resume tail
            </button>
          )}

          {searchOpen && (
            <div className="search-overlay">
              <Icons.Search size={13} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find in logs…"
                spellCheck={false}
              />
              {search && <span className="search-count">{filtered.length} match{filtered.length === 1 ? "" : "es"}</span>}
              <button className="icon-btn" onClick={() => { setSearchOpen(false); setSearch(""); }}>
                <Icons.Close size={11} />
              </button>
            </div>
          )}

          {usingFake && (
            <div className="fake-badge">
              <Icons.Wand size={11} /> Simulated log stream
            </div>
          )}

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            theme={tweaks.theme} setTheme={(v) => setTweak("theme", v)}
            accent={tweaks.accent} setAccent={(v) => setTweak("accent", v)}
            density={tweaks.density} setDensity={(v) => setTweak("density", v)}
            showHeatmap={tweaks.showHeatmap} setShowHeatmap={(v) => setTweak("showHeatmap", v)}
            showScrubber={tweaks.showScrubber} setShowScrubber={(v) => setTweak("showScrubber", v)}
          />

          {toast && <div className="toast">{toast}</div>}
        </>
      )}
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
function rowHeightFor(density) {
  return density === "compact" ? 22 : density === "comfortable" ? 32 : 26;
}
function formatExport(e) {
  return `${formatTs(e.ts)} ${e.pid}-${e.tid} ${e.pkg} ${e.tag} ${e.level}: ${e.message}`;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
