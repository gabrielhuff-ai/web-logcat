// WebLogcat — Log row + log table

const LEVEL_LABEL = { V: "V", D: "D", I: "I", W: "W", E: "E" };

function highlightField(text, value, color) {
  if (!value) return [];
  const out = [];
  const lower = text.toLowerCase();
  const needle = value.toLowerCase();
  let i = 0;
  while (true) {
    const idx = lower.indexOf(needle, i);
    if (idx < 0) break;
    out.push({ start: idx, end: idx + needle.length, color });
    i = idx + needle.length;
  }
  return out;
}

const LogRow = React.memo(function LogRow({ entry, filters, search, showTimestamps, showPid, wrapLines, density, pinned, onTogglePin, isMatch, onlyMatches, expanded, onToggleExpand, isCrashHead }) {
  // Build per-field highlight ranges from filters
  // - message: filters with type message (matches msg, tag, pkg)
  // - tag-typed filters highlight the tag cell
  // - process-typed filters highlight the pkg cell
  const msgRanges = React.useMemo(() => {
    const out = [];
    for (const f of filters) {
      if (f.type === "message") out.push(...highlightField(entry.message, f.value, f.color));
    }
    if (search) out.push(...highlightField(entry.message, search, "search"));
    return out;
  }, [entry.message, filters, search]);

  const tagRanges = React.useMemo(() => {
    const out = [];
    for (const f of filters) {
      if (f.type === "tag" || f.type === "message") out.push(...highlightField(entry.tag, f.value, f.color));
    }
    return out;
  }, [entry.tag, filters]);

  const pkgRanges = React.useMemo(() => {
    const out = [];
    for (const f of filters) {
      if (f.type === "process" || f.type === "message") out.push(...highlightField(entry.pkg, f.value, f.color));
    }
    return out;
  }, [entry.pkg, filters]);

  const ts = formatTs(entry.ts);

  return (
    <div
      className={"row" + (entry.isCrashLine ? " crash" : "") + (pinned ? " pinned" : "") + (isMatch ? " match" : "")}
      data-level={entry.level}
      data-density={density}
    >
      <div className="row-rail" />
      <button className="row-pin" onClick={onTogglePin} title={pinned ? "Unpin" : "Pin line"}>
        {pinned ? <Icons.PinFilled size={11} /> : <Icons.Pin size={11} />}
      </button>
      {showTimestamps && <span className="cell ts">{ts}</span>}
      {showPid && <span className="cell pid">{entry.pid}-{entry.tid}</span>}
      <span className="cell pkg" title={entry.pkg}><HighlightedText text={entry.pkg} ranges={pkgRanges} /></span>
      <span className="cell tag" title={entry.tag}><HighlightedText text={entry.tag} ranges={tagRanges} /></span>
      <span className={"cell level lvl-" + entry.level}>{LEVEL_LABEL[entry.level]}</span>
      <span className={"cell msg" + (wrapLines ? " wrap" : "")}>
        <HighlightedText text={entry.message} ranges={msgRanges} />
        {isCrashHead && (
          <button className="crash-toggle" onClick={onToggleExpand}>
            {expanded ? "Collapse stack trace" : "Show stack trace"}
            <Icons.Chevron size={11} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease-out)" }} />
          </button>
        )}
      </span>
    </div>
  );
});

const HighlightedText = ({ text, ranges }) => {
  if (!ranges || !ranges.length) return <>{text}</>;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  const parts = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) parts.push(<React.Fragment key={cursor}>{text.slice(cursor, r.start)}</React.Fragment>);
    const cls = "hl " + (r.color === "search" ? "hl-search" : `hl-c${r.color}`);
    parts.push(<mark key={r.start} className={cls}>{text.slice(r.start, r.end)}</mark>);
    cursor = r.end;
  }
  if (cursor < text.length) parts.push(<React.Fragment key={cursor + "_"}>{text.slice(cursor)}</React.Fragment>);
  return <>{parts}</>;
};

function formatTs(ts) {
  const d = new Date(ts);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

window.LogRow = LogRow;
window.formatTs = formatTs;
