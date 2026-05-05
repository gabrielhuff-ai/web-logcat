// WebLogcat — Filter bar with chips + autocomplete, transport + display toggles

const PALETTE_SIZE = 6;

const FilterBar = ({
  filters, setFilters,
  onlyMatches, setOnlyMatches,
  knownProcesses, knownTags,
  paused, setPaused,
  onClear,
  autoScroll, setAutoScroll,
  showTimestamps, setShowTimestamps,
  showPid, setShowPid,
  wrapLines, setWrapLines,
}) => {
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [acIdx, setAcIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  const suggestions = React.useMemo(() => {
    const d = draft.trim();
    if (!d) {
      // Show all filter types as discoverable starters
      return Filters.FILTER_TYPES.map(t => ({
        kind: "type",
        label: `${t}:`,
        insert: `${t}:`,
        hint: typeHint(t),
      }));
    }
    const colon = d.indexOf(":");
    if (colon < 0) {
      const out = [];
      for (const t of Filters.FILTER_TYPES) {
        if (t.startsWith(d.toLowerCase())) out.push({ kind: "type", label: `${t}:`, insert: `${t}:`, hint: typeHint(t) });
      }
      // If user typed plain text without a colon, also offer message-search
      out.push({ kind: "value", label: `message contains "${d}"`, insert: d, hint: "highlight" });
      return out;
    }
    const type = d.slice(0, colon).toLowerCase();
    const value = d.slice(colon + 1).trim();
    if (!Filters.FILTER_TYPES.includes(type)) return [];
    let pool = [];
    if (type === "process") pool = knownProcesses;
    else if (type === "tag") pool = knownTags;
    else if (type === "level") pool = ["V", "D", "I", "W", "E"];
    else return [];
    const lc = value.toLowerCase();
    return pool.filter(p => !lc || p.toLowerCase().includes(lc)).slice(0, 8)
      .map(p => ({ kind: "value", label: `${type}:${p}`, insert: `${type}:${p}`, hint: type }));
  }, [draft, knownProcesses, knownTags]);

  React.useEffect(() => { setAcIdx(0); }, [draft]);

  const commit = (text) => {
    const f = Filters.makeFilter(text || draft, PALETTE_SIZE);
    if (f) setFilters([...filters, f]);
    setDraft("");
  };
  const removeFilter = (id) => setFilters(filters.filter(f => f.id !== id));

  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length && focused) {
        const s = suggestions[acIdx];
        if (s.kind === "type") { setDraft(s.insert); return; }
        commit(s.insert); return;
      }
      commit();
    } else if (e.key === "Backspace" && !draft && filters.length) {
      removeFilter(filters[filters.length - 1].id);
    } else if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault(); setAcIdx((acIdx + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault(); setAcIdx((acIdx - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Tab" && suggestions.length) {
      e.preventDefault(); setDraft(suggestions[acIdx].insert);
    } else if (e.key === "Escape") { setDraft(""); e.target.blur(); }
  };

  return (
    <div className="filter-bar">
      <div className="fb-transport">
        <button
          className={"icon-btn tt " + (paused ? "" : "active")}
          data-tt={paused ? "Resume (Space)" : "Pause (Space)"}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Icons.Play size={15} /> : <Icons.Pause size={14} />}
        </button>
        <button className="icon-btn tt" data-tt="Clear logs (⌘K)" onClick={onClear}>
          <Icons.Clear />
        </button>
        <button
          className={"icon-btn tt " + (autoScroll ? "active" : "")}
          data-tt={autoScroll ? "Auto-scroll ON" : "Scroll-locked"}
          onClick={() => setAutoScroll(!autoScroll)}
        >
          {autoScroll ? <Icons.Down /> : <Icons.Lock />}
        </button>
      </div>

      <div className="divider" />

      <div className="fb-chips" onClick={() => inputRef.current?.focus()}>
        {filters.map(f => (
          <FilterChip key={f.id} f={f} onRemove={() => removeFilter(f.id)} />
        ))}
        <div className="fb-input-wrap">
          <input
            ref={inputRef}
            className="fb-input"
            value={draft}
            placeholder={filters.length ? "" : "Filter — type to highlight, or use  process:  tag:  pid:  level:"}
            onChange={e => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKey}
            spellCheck={false}
          />
          {focused && suggestions.length > 0 && (
            <div className="fb-ac">
              {!draft.trim() && (
                <div className="fb-ac-head">Filter by — pick a type or just type to highlight</div>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={s.label}
                  className={"fb-ac-item " + (i === acIdx ? "active" : "")}
                  onMouseEnter={() => setAcIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (s.kind === "type") setDraft(s.insert); else commit(s.insert);
                  }}
                >
                  <span className="fb-ac-label">{s.label}</span>
                  <span className="fb-ac-hint">{s.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        className={"icon-btn tt " + (onlyMatches ? "active" : "")}
        data-tt={onlyMatches ? "Showing only matches" : "Show only matches"}
        onClick={() => setOnlyMatches(!onlyMatches)}
        disabled={filters.length === 0}
      >
        {onlyMatches ? <Icons.FilterFilled size={15} /> : <Icons.Filter size={15} />}
      </button>

      <div className="divider" />

      <div className="fb-display">
        <button className={"tb-mini tt " + (showTimestamps ? "active" : "")} data-tt="Timestamps" onClick={() => setShowTimestamps(!showTimestamps)}>
          <Icons.Time size={13} /> ts
        </button>
        <button className={"tb-mini tt " + (showPid ? "active" : "")} data-tt="PID / TID" onClick={() => setShowPid(!showPid)}>
          <Icons.Hash size={13} /> pid
        </button>
        <button className={"tb-mini tt " + (wrapLines ? "active" : "")} data-tt="Wrap long lines" onClick={() => setWrapLines(!wrapLines)}>
          <Icons.Wrap size={13} /> wrap
        </button>
      </div>

      <style>{`
        .filter-bar {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px;
          background: var(--bg-1);
          border-bottom: 1px solid var(--line);
          min-height: 52px;
        }
        .fb-transport { display: inline-flex; gap: 2px; }
        .fb-display { display: inline-flex; gap: 4px; }
        .fb-chips {
          flex: 1; min-width: 0;
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
          padding: 4px 6px;
          border: 1px solid var(--line);
          border-radius: var(--r-md);
          background: var(--bg-0);
          cursor: text;
          transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
          position: relative;
          min-height: 34px;
        }
        .fb-chips:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px oklch(from var(--accent) l c h / 0.18);
        }
        .fb-input-wrap { position: relative; flex: 1; min-width: 220px; }
        .fb-input {
          width: 100%; height: 26px;
          background: transparent; border: 0; outline: none;
          font-size: var(--t-base); color: var(--fg-0);
        }
        .fb-input::placeholder { color: var(--fg-3); }
        .fb-ac {
          position: absolute;
          top: calc(100% + 6px); left: -8px;
          min-width: 320px;
          background: var(--bg-2);
          border: 1px solid var(--line);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-2);
          padding: 4px;
          z-index: 60;
          animation: slideUp 140ms var(--ease-out) both;
        }
        .fb-ac-item {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 6px 8px;
          border-radius: var(--r-sm);
          font-size: var(--t-base); color: var(--fg-1);
          text-align: left;
        }
        .fb-ac-item.active { background: var(--bg-hover); color: var(--fg-0); }
        .fb-ac-label { font-weight: 500; }
        .fb-ac-hint { font-size: var(--t-xs); color: var(--fg-3); margin-left: 12px; }
        .fb-ac-head {
          font-size: var(--t-xs);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--fg-3);
          padding: 8px 8px 6px;
        }
      `}</style>
    </div>
  );
};

const FilterChip = ({ f, onRemove }) => {
  const style = {
    "--c-fg": `oklch(var(--fc-l) var(--fc-c) var(--fc-${f.color}))`,
    "--c-bg": `oklch(var(--fc-bg-l) var(--fc-bg-c) var(--fc-${f.color}))`,
  };
  return (
    <span className="chip" style={style}>
      {f.type !== "message" && <span className="chip-type">{f.type}:</span>}
      <span className="chip-val">{f.value}</span>
      <button className="chip-x" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Remove filter">
        <Icons.Close size={9} />
      </button>
      <style>{`
        .chip {
          display: inline-flex; align-items: center; gap: 4px;
          height: 24px; padding: 0 4px 0 8px;
          border-radius: var(--r-pill);
          font-size: var(--t-sm);
          background: var(--c-bg); color: var(--c-fg);
          animation: slideUp 160ms var(--ease-out) both;
          max-width: 320px;
        }
        .chip-type { opacity: 0.7; font-weight: 500; }
        .chip-val { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
        .chip-x {
          width: 16px; height: 16px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 50%;
          color: var(--c-fg); opacity: 0.6;
          margin-left: 2px;
        }
        .chip-x:hover { background: oklch(from var(--c-fg) l c h / 0.18); opacity: 1; }
      `}</style>
    </span>
  );
};

function typeHint(t) {
  switch (t) {
    case "process": return "package name";
    case "tag":     return "log tag";
    case "pid":     return "process / thread id";
    case "level":   return "V D I W E";
    case "message": return "message text";
    default: return "";
  }
}

window.FilterBar = FilterBar;
