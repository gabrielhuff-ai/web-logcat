// WebLogcat — Heatmap gutter + scrubber

const Heatmap = ({ buckets, currentSecond, onJumpToSecond, height = "auto" }) => {
  // buckets: array of { count, dominant: level } for the last N seconds (newest at end)
  const max = Math.max(1, ...buckets.map(b => b.count));
  return (
    <div className="heatmap" style={{ height }}>
      {buckets.map((b, i) => {
        const intensity = Math.min(1, b.count / max);
        const lvl = b.dominant || "I";
        return (
          <button
            key={i}
            className={"hm-cell lvl-" + lvl}
            style={{ "--int": intensity, opacity: 0.15 + intensity * 0.85 }}
            data-current={i === currentSecond ? "1" : "0"}
            onClick={() => onJumpToSecond(i)}
            title={`${b.count} log${b.count === 1 ? "" : "s"} · ${b.secondsAgo}s ago`}
          />
        );
      })}
      <style>{`
        .heatmap {
          width: 14px;
          background: var(--bg-1);
          border-right: 1px solid var(--line);
          display: flex; flex-direction: column; gap: 1px;
          padding: 2px;
          overflow: hidden;
        }
        .hm-cell {
          flex: 1 1 0;
          min-height: 2px;
          border-radius: 1px;
          background: var(--lvl-cell, var(--fg-3));
          transition: opacity var(--dur-fast) var(--ease-out);
          cursor: pointer;
        }
        .hm-cell.lvl-V { --lvl-cell: var(--lvl-v-fg); }
        .hm-cell.lvl-D { --lvl-cell: var(--lvl-d-fg); }
        .hm-cell.lvl-I { --lvl-cell: var(--lvl-i-fg); }
        .hm-cell.lvl-W { --lvl-cell: var(--lvl-w-fg); }
        .hm-cell.lvl-E { --lvl-cell: var(--lvl-e-fg); }
        .hm-cell:hover { opacity: 1 !important; transform: scaleX(1.3); }
        .hm-cell[data-current="1"] {
          opacity: 1 !important;
          box-shadow: 0 0 0 1.5px var(--accent);
        }
      `}</style>
    </div>
  );
};

const Scrubber = ({ buckets, viewportStart, viewportEnd, onScrub, total }) => {
  const ref = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const max = Math.max(1, ...buckets.map(b => b.count));

  const handle = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = x / rect.width;
    onScrub(pct);
  };

  React.useEffect(() => {
    if (!dragging) return;
    const move = (e) => handle(e);
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [dragging]);

  // viewport rect
  const vw = `${Math.max(2, (viewportEnd - viewportStart) * 100)}%`;
  const vl = `${viewportStart * 100}%`;

  return (
    <div className="scrub" ref={ref} onMouseDown={(e) => { setDragging(true); handle(e); }}>
      <div className="scrub-bg">
        {buckets.map((b, i) => (
          <div
            key={i}
            className={"scrub-bar lvl-" + (b.dominant || "I")}
            style={{ "--h": `${(b.count / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="scrub-window" style={{ left: vl, width: vw }} />
      <div className="scrub-meta">
        <span>{total.toLocaleString()} logs · {buckets.length}s window</span>
      </div>
      <style>{`
        .scrub {
          position: relative;
          height: 36px;
          padding: 4px 8px;
          background: var(--bg-1);
          border-top: 1px solid var(--line);
          cursor: ew-resize;
          user-select: none;
          overflow: hidden;
        }
        .scrub-bg {
          display: flex; gap: 1px;
          align-items: flex-end;
          height: 100%;
          width: 100%;
          padding-right: 80px;
        }
        .scrub-bar {
          flex: 1; min-width: 1px;
          height: var(--h);
          background: var(--lvl-cell, var(--fg-3));
          opacity: 0.45;
          border-radius: 1px;
          transition: opacity var(--dur-fast) var(--ease-out);
        }
        .scrub-bar.lvl-V { --lvl-cell: var(--lvl-v-fg); }
        .scrub-bar.lvl-D { --lvl-cell: var(--lvl-d-fg); }
        .scrub-bar.lvl-I { --lvl-cell: var(--lvl-i-fg); }
        .scrub-bar.lvl-W { --lvl-cell: var(--lvl-w-fg); }
        .scrub-bar.lvl-E { --lvl-cell: var(--lvl-e-fg); }
        .scrub:hover .scrub-bar { opacity: 0.75; }
        .scrub-window {
          position: absolute; top: 2px; bottom: 2px;
          background: oklch(from var(--accent) l c h / 0.18);
          border: 1px solid var(--accent);
          border-radius: 3px;
          pointer-events: none;
        }
        .scrub-meta {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          font-size: var(--t-xs);
          color: var(--fg-3);
          letter-spacing: 0.04em;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

window.Heatmap = Heatmap;
window.Scrubber = Scrubber;
