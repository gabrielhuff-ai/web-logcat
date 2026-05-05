// Dashboard — tile grid + topbar + add-widget palette.
// Tiles live on a 12-col x N-row grid. Each tile knows its widget kind + props.

const WIDGET_REGISTRY = {
  logcat:  { name: "Logcat",         icon: "Stack",    desc: "Live system log stream",            comp: "LogcatWidget",  defaultSize: { w: 12, h: 8 } },
  shell:   { name: "Shell",          icon: "Terminal", desc: "Interactive ADB shell with splits", comp: "ShellWidget",   defaultSize: { w: 6,  h: 6 } },
  dumpsys: { name: "Dumpsys",        icon: "Dumpsys",  desc: "Run preset dumpsys commands",       comp: "DumpsysWidget", defaultSize: { w: 6,  h: 6 } },
  files:   { name: "Files",          icon: "Folder",   desc: "Browse, push & pull device files",  comp: "FilesWidget",   defaultSize: { w: 8,  h: 6 } },
  mirror:  { name: "Screen Mirror",  icon: "Mirror",   desc: "scrcpy-style live device screen",   comp: "MirrorWidget",  defaultSize: { w: 4,  h: 8 } },
};

const DEFAULT_LAYOUT = [
  { id: "w1", kind: "mirror",  x: 0,  y: 0,  w: 3, h: 10 },
  { id: "w2", kind: "logcat",  x: 3,  y: 0,  w: 9, h: 6 },
  { id: "w3", kind: "shell",   x: 3,  y: 6,  w: 5, h: 4 },
  { id: "w4", kind: "dumpsys", x: 8,  y: 6,  w: 4, h: 4 },
];

const STORAGE_KEY = "weblogcat-dashboard-v1";

function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  return DEFAULT_LAYOUT;
}
function saveLayout(layout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch {}
}

const COLS = 12;
const ROW_PX = 56;
const GAP = 10;
const HEAD_PX = 36;

function Dashboard({ device, devices, onSwitchDevice, onDisconnect, theme, setTheme, tweaks, setTweak, usingFake }) {
  const [layout, setLayout] = React.useState(loadLayout);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [maximized, setMaximized] = React.useState(null);
  const [drag, setDrag] = React.useState(null); // { id, mode: 'move'|'resize', startX, startY, origin: {x,y,w,h} }
  const gridRef = React.useRef(null);

  React.useEffect(() => { saveLayout(layout); }, [layout]);

  const addWidget = (kind) => {
    const def = WIDGET_REGISTRY[kind];
    const id = "w" + Date.now().toString(36);
    // place at top-right area
    const maxY = layout.reduce((m, t) => Math.max(m, t.y + t.h), 0);
    setLayout([...layout, { id, kind, x: 0, y: maxY, w: def.defaultSize.w, h: def.defaultSize.h }]);
    setPaletteOpen(false);
  };
  const removeWidget = (id) => setLayout(l => l.filter(t => t.id !== id));
  const updateTile = (id, patch) => setLayout(l => l.map(t => t.id === id ? { ...t, ...patch } : t));
  const toggleBars = (id) => setLayout(l => l.map(t => t.id === id ? { ...t, barsHidden: !t.barsHidden } : t));

  const colWidth = () => {
    const el = gridRef.current;
    if (!el) return 100;
    const w = el.clientWidth - GAP * (COLS - 1);
    return w / COLS;
  };

  const onPointerDown = (e, id, mode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const tile = layout.find(t => t.id === id);
    if (!tile) return;
    setDrag({ id, mode, startX: e.clientX, startY: e.clientY, origin: { ...tile } });
  };

  React.useEffect(() => {
    if (!drag) return;
    const cw = colWidth();
    const onMove = (e) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const dCol = Math.round(dx / (cw + GAP));
      const dRow = Math.round(dy / (ROW_PX + GAP));
      if (drag.mode === "move") {
        const x = Math.max(0, Math.min(COLS - drag.origin.w, drag.origin.x + dCol));
        const y = Math.max(0, drag.origin.y + dRow);
        updateTile(drag.id, { x, y });
      } else if (drag.mode === "resize") {
        const w = Math.max(2, Math.min(COLS - drag.origin.x, drag.origin.w + dCol));
        const h = Math.max(2, drag.origin.h + dRow);
        updateTile(drag.id, { w, h });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, layout]);

  const totalRows = Math.max(12, ...layout.map(t => t.y + t.h));

  const tileStyle = (t) => {
    if (maximized === t.id) {
      return {
        position: "absolute",
        left: 0, top: 0, right: 0, bottom: 0,
        width: "auto", height: "auto",
        zIndex: 30,
      };
    }
    return {
      gridColumn: `${t.x + 1} / span ${t.w}`,
      gridRow: `${t.y + 1} / span ${t.h}`,
    };
  };

  return (
    <div className="dash">
      <DashTopbar
        device={device}
        devices={devices}
        onSwitchDevice={onSwitchDevice}
        onDisconnect={onDisconnect}
        theme={theme}
        setTheme={setTheme}
        onAddWidget={() => setPaletteOpen(true)}
        onResetLayout={() => { setLayout(DEFAULT_LAYOUT); }}
        widgetCount={layout.length}
        usingFake={usingFake}
      />

      <div
        className={"dash-grid " + (drag ? "dragging " : "") + (maximized ? "has-max " : "")}
        ref={gridRef}
        style={{
          gridTemplateRows: `repeat(${totalRows}, ${ROW_PX}px)`,
        }}
      >
        {layout.map(t => {
          const def = WIDGET_REGISTRY[t.kind];
          if (!def) return null;
          const Comp = window[def.comp];
          const IconC = Icons[def.icon];
          const isMax = maximized === t.id;
          const isDragging = drag?.id === t.id;
          return (
            <div
              key={t.id}
              className={"tile " + (isDragging ? "dragging " : "") + (isMax ? "max " : "") + (t.barsHidden ? "bars-hidden " : "")}
              style={tileStyle(t)}
            >
              <div className="tile-head" onPointerDown={(e) => !isMax && onPointerDown(e, t.id, "move")}>
                <span className="tile-grip">
                  <Icons.Drag size={11} />
                </span>
                <span className="tile-icon">{IconC ? <IconC size={12} /> : null}</span>
                <span className="tile-title">{def.name}</span>
                <span style={{ flex: 1 }} />
                <button
                  className="tile-btn tt"
                  data-tt={t.barsHidden ? "Show widget bar" : "Hide widget bar"}
                  onClick={() => toggleBars(t.id)}
                >
                  {t.barsHidden ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}
                </button>
                <button
                  className="tile-btn tt"
                  data-tt={isMax ? "Restore" : "Maximize"}
                  onClick={() => setMaximized(isMax ? null : t.id)}
                >
                  {isMax ? <Icons.Minimize size={11} /> : <Icons.Maximize size={11} />}
                </button>
                <button
                  className="tile-btn tt"
                  data-tt="Remove widget"
                  onClick={() => removeWidget(t.id)}
                >
                  <Icons.Close size={11} />
                </button>
              </div>
              <div className="tile-body">
                {Comp ? (
                  <Comp device={device} initial={t.props} tweaks={tweaks} setTweak={setTweak} />
                ) : (
                  <div style={{ padding: 16, color: "var(--fg-3)" }}>Unknown widget: {t.kind}</div>
                )}
              </div>
              {!isMax && (
                <div
                  className="tile-resize"
                  onPointerDown={(e) => onPointerDown(e, t.id, "resize")}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M 11 5 L 5 11 M 11 9 L 9 11 M 11 1 L 1 11" stroke="currentColor" strokeWidth="1" fill="none" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {layout.length === 0 && (
          <div className="dash-empty">
            <Icons.Layout size={28} />
            <h3>Empty dashboard</h3>
            <p>Add a widget to begin monitoring this device.</p>
            <button className="dash-empty-btn" onClick={() => setPaletteOpen(true)}>
              <Icons.Plus size={13} /> Add widget
            </button>
          </div>
        )}
      </div>

      {paletteOpen && (
        <WidgetPalette
          onClose={() => setPaletteOpen(false)}
          onPick={addWidget}
        />
      )}
    </div>
  );
}

function DashTopbar({ device, devices, onSwitchDevice, onDisconnect, theme, setTheme, onAddWidget, onResetLayout, widgetCount, usingFake }) {
  const [devOpen, setDevOpen] = React.useState(false);
  return (
    <div className="dash-top">
      <div className="dash-brand">
        <span className="dash-brand-glyph">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M 4 5 L 4 13 M 8 3 L 8 15 M 12 7 L 12 11 M 14 5 L 14 13" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="dash-brand-name">WebLogcat</span>
        <span className="dash-brand-sub">Dashboard</span>
      </div>

      <div className="dash-device" onClick={() => setDevOpen(o => !o)}>
        <span className="dash-device-status" data-fake={usingFake}>
          <span className="dash-device-dot" />
        </span>
        <Icons.Device size={13} />
        <div className="dash-device-info">
          <div className="dash-device-name">{device?.label || device?.model || "—"}</div>
          <div className="dash-device-meta">{device?.serial} · Android {device?.android}</div>
        </div>
        <Icons.Chevron size={11} />
        {devOpen && (
          <div className="dash-device-pop" onClick={(e) => e.stopPropagation()}>
            {devices.map(d => (
              <button key={d.serial} className={"dash-device-row " + (d.serial === device?.serial ? "current" : "")} onClick={() => { onSwitchDevice(d); setDevOpen(false); }}>
                <span className={"dash-device-row-dot " + (d.status === "fake" ? "fake" : "")} />
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ color: "var(--fg-0)", fontSize: "var(--t-sm)" }}>{d.label || d.model}</div>
                  <div style={{ color: "var(--fg-3)", fontSize: "var(--t-xs)", fontFamily: "var(--font-mono)" }}>{d.serial}</div>
                </div>
                {d.serial === device?.serial && <Icons.Check size={12} />}
              </button>
            ))}
            <div className="dash-device-pop-foot">
              <button onClick={() => { onDisconnect(); setDevOpen(false); }}>
                <Icons.Close size={11} /> Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div className="dash-actions">
        <button className="dash-add" onClick={onAddWidget}>
          <Icons.Plus size={13} /> Add widget
        </button>
        <button className="icon-btn tt" data-tt="Reset layout" onClick={onResetLayout}>
          <Icons.Refresh size={13} />
        </button>
        <div className="dash-divider" />
        <button className="icon-btn tt" data-tt={theme === "dark" ? "Switch to light" : "Switch to dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Icons.Sun size={13} /> : <Icons.Moon size={13} />}
        </button>
      </div>
    </div>
  );
}

function WidgetPalette({ onClose, onPick }) {
  return (
    <>
      <div className="palette-back" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Add widget">
        <div className="palette-head">
          <h3>Add widget</h3>
          <button className="icon-btn" onClick={onClose}><Icons.Close size={12} /></button>
        </div>
        <div className="palette-grid">
          {Object.entries(WIDGET_REGISTRY).map(([key, def]) => {
            const IconC = Icons[def.icon];
            return (
              <button key={key} className="palette-card" onClick={() => onPick(key)}>
                <div className="palette-card-icon">{IconC ? <IconC size={20} /> : null}</div>
                <div className="palette-card-title">{def.name}</div>
                <div className="palette-card-desc">{def.desc}</div>
              </button>
            );
          })}
        </div>
        <div className="palette-foot">
          Drag widget headers to rearrange · Drag bottom-right corner to resize
        </div>
      </div>
    </>
  );
}

window.Dashboard = Dashboard;
