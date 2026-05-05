// WebLogcat — Settings panel + level filter pills

const LevelFilter = ({ enabled, setEnabled }) => {
  const levels = [
    { l: "V", label: "Verbose" },
    { l: "D", label: "Debug" },
    { l: "I", label: "Info" },
    { l: "W", label: "Warn" },
    { l: "E", label: "Error" },
  ];
  const solo = (l) => {
    const next = { V: false, D: false, I: false, W: false, E: false };
    next[l] = true;
    setEnabled(next);
  };
  return (
    <div className="lvl-filter">
      {levels.map(({ l, label }) => (
        <button
          key={l}
          className={"lvl-pill lvl-" + l + (enabled[l] ? " on" : " off")}
          onClick={() => setEnabled({ ...enabled, [l]: !enabled[l] })}
          onDoubleClick={() => solo(l)}
          title={`${label} — double-click to solo`}
        >
          <span className="lvl-letter">{l}</span>
          <span className="lvl-name">{label}</span>
        </button>
      ))}
      <style>{`
        .lvl-filter { display: flex; gap: 4px; padding: 0 8px; }
        .lvl-pill {
          display: inline-flex; align-items: center; gap: 6px;
          height: 28px; padding: 0 10px 0 6px;
          border-radius: var(--r-pill);
          font-size: var(--t-sm);
          background: var(--bg-1);
          color: var(--fg-2);
          border: 1px solid transparent;
          transition: all var(--dur-fast) var(--ease-out);
        }
        .lvl-pill .lvl-letter {
          width: 18px; height: 18px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: var(--t-xs);
          background: var(--bg-3); color: var(--fg-2);
        }
        .lvl-pill.on { background: var(--bg-2); color: var(--fg-0); }
        .lvl-pill.on.lvl-V .lvl-letter { background: var(--lvl-v-bg); color: var(--lvl-v-fg); }
        .lvl-pill.on.lvl-D .lvl-letter { background: var(--lvl-d-bg); color: var(--lvl-d-fg); }
        .lvl-pill.on.lvl-I .lvl-letter { background: var(--lvl-i-bg); color: var(--lvl-i-fg); }
        .lvl-pill.on.lvl-W .lvl-letter { background: var(--lvl-w-bg); color: var(--lvl-w-fg); }
        .lvl-pill.on.lvl-E .lvl-letter { background: var(--lvl-e-bg); color: var(--lvl-e-fg); }
        .lvl-pill.off { opacity: 0.5; }
        .lvl-pill.off .lvl-name { text-decoration: line-through; opacity: 0.7; }
        .lvl-pill:hover { background: var(--bg-3); }
      `}</style>
    </div>
  );
};

const SettingsPanel = ({ open, onClose, theme, setTheme, accent, setAccent, density, setDensity, showHeatmap, setShowHeatmap, showScrubber, setShowScrubber }) => {
  if (!open) return null;
  const accents = [
    { k: "indigo", label: "Indigo", hue: 268 },
    { k: "teal", label: "Teal", hue: 190 },
    { k: "amber", label: "Amber", hue: 60 },
    { k: "rose", label: "Rose", hue: 12 },
  ];
  return (
    <>
      <div className="settings-scrim" onClick={onClose} />
      <div className="settings">
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose}><Icons.Close size={14} /></button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Appearance</div>
          <div className="settings-row">
            <div className="settings-key">Theme</div>
            <div className="seg">
              <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
                <Icons.Sun size={13} /> Light
              </button>
              <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
                <Icons.Moon size={13} /> Dark
              </button>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-key">Color scheme</div>
            <div className="accents">
              {accents.map(a => (
                <button
                  key={a.k}
                  className={"accent-swatch " + (accent === a.k ? "active" : "")}
                  onClick={() => setAccent(a.k)}
                >
                  <span className="sw" style={{ background: `oklch(${theme === "dark" ? "0.74" : "0.50"} 0.16 ${a.hue})` }} />
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">Display</div>
          <div className="settings-row">
            <div className="settings-key">Density</div>
            <div className="seg">
              {["compact", "cozy", "comfortable"].map(d => (
                <button key={d} className={density === d ? "active" : ""} onClick={() => setDensity(d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-key">Heatmap gutter</div>
            <button className={"toggle " + (showHeatmap ? "on" : "")} onClick={() => setShowHeatmap(!showHeatmap)}>
              <span className="toggle-dot" />
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-key">Timeline scrubber</div>
            <button className={"toggle " + (showScrubber ? "on" : "")} onClick={() => setShowScrubber(!showScrubber)}>
              <span className="toggle-dot" />
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-label">About</div>
          <div className="settings-about">
            WebLogcat — a web-based Android logcat viewer. <br />
            Built with WebUSB + ADB protocol. <br />
            Currently showing simulated log data.
          </div>
        </div>
      </div>

      <style>{`
        .settings-scrim {
          position: absolute; inset: 0;
          background: oklch(0 0 0 / 0.4);
          backdrop-filter: blur(2px);
          z-index: 100;
          animation: fadeIn 200ms var(--ease-out) both;
        }
        .settings {
          position: absolute; top: 0; right: 0; bottom: 0;
          width: min(440px, 92vw);
          background: var(--bg-1);
          border-left: 1px solid var(--line);
          z-index: 101;
          padding: 0;
          animation: slideInRight 280ms var(--ease-out) both;
          overflow-y: auto;
        }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .settings-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--line);
        }
        .settings-head h2 { margin: 0; font-size: var(--t-lg); font-weight: 600; }
        .settings-section { padding: 24px; border-bottom: 1px solid var(--line); }
        .settings-label {
          font-size: var(--t-xs); letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--fg-3); margin-bottom: 16px;
        }
        .settings-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; gap: 16px; }
        .settings-key { font-size: var(--t-base); color: var(--fg-1); }
        .seg {
          display: inline-flex; padding: 3px;
          background: var(--bg-2); border-radius: var(--r-md);
          gap: 2px;
        }
        .seg button {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: var(--t-sm);
          color: var(--fg-2);
          transition: all var(--dur-fast) var(--ease-out);
        }
        .seg button.active { background: var(--bg-0); color: var(--fg-0); box-shadow: var(--shadow-1); }
        .accents { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .accent-swatch {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 8px 12px;
          border-radius: var(--r-md);
          background: var(--bg-2);
          font-size: var(--t-sm);
          color: var(--fg-1);
          border: 1.5px solid transparent;
          transition: all var(--dur-fast) var(--ease-out);
        }
        .accent-swatch:hover { background: var(--bg-3); }
        .accent-swatch.active { border-color: var(--accent); color: var(--fg-0); }
        .accent-swatch .sw {
          width: 16px; height: 16px; border-radius: 50%;
          box-shadow: 0 0 0 2px var(--bg-2);
        }
        .settings-about { font-size: var(--t-sm); color: var(--fg-2); line-height: 1.7; }
        .toggle {
          width: 36px; height: 20px;
          background: var(--bg-3);
          border-radius: 999px;
          position: relative;
          transition: background-color var(--dur-fast) var(--ease-out);
        }
        .toggle.on { background: var(--accent); }
        .toggle-dot {
          position: absolute; top: 2px; left: 2px;
          width: 16px; height: 16px;
          background: var(--fg-0);
          border-radius: 50%;
          transition: transform var(--dur-fast) var(--ease-spring);
        }
        .toggle.on .toggle-dot { transform: translateX(16px); background: var(--on-accent); }
      `}</style>
    </>
  );
};

window.LevelFilter = LevelFilter;
window.SettingsPanel = SettingsPanel;
