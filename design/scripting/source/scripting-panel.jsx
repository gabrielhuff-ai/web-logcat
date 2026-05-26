// Scripting widget — runtime panel (the widget body).
// Layout: displays band (full width), inputs grid above (auto-flow).
// States surfaced as discrete demo panels for the design canvas.

// ── Tile chrome wrapper (matches dashboard.css conventions) ────────────────
function FakeTile({ title = "Scripting", barsHidden = false, busy = false, scriptError = false, children, w, h, footer = null }) {
  return (
    <div className={"ft-tile" + (barsHidden ? " bars-hidden" : "")} style={{ width: w, height: h }}>
      <div className="ft-head">
        <span className="ft-grip"><Icons.Drag size={11} /></span>
        <span className="ft-icon"><Icons.Wand size={12} /></span>
        <span className="ft-title">{title}</span>
        {busy && <span className="ft-dot busy" />}
        {scriptError && (
          <span className="ft-err-pill" data-tip="Script has syntax errors — open settings to fix">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2 L1 21 H23 Z M12 9 V14 M12 17 V17.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></svg>
            script error
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="ft-btn"><Icons.Settings size={11} /></button>
        <button className="ft-btn">{barsHidden ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}</button>
        <button className="ft-btn"><Icons.Maximize size={11} /></button>
        <button className="ft-btn"><Icons.Close size={11} /></button>
      </div>
      <div className="ft-body">{children}</div>
      {footer}
      <div className="ft-resize">
        <svg width="10" height="10" viewBox="0 0 12 12"><path d="M 11 5 L 5 11 M 11 9 L 9 11 M 11 1 L 1 11" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
      </div>
      <style>{FT_STYLES}</style>
    </div>
  );
}

const FT_STYLES = `
  .ft-tile {
    display: flex; flex-direction: column;
    background: oklch(from var(--bg-1) l c h / 0.7);
    backdrop-filter: blur(14px);
    border: 1px solid var(--glass-line);
    border-radius: var(--r-lg);
    box-shadow: 0 1px 0 oklch(1 0 0 / 0.04) inset, 0 4px 24px oklch(0 0 0 / 0.25);
    overflow: hidden;
    position: relative;
  }
  .ft-head {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 8px 7px 4px;
    height: 34px;
    flex-shrink: 0;
    background: oklch(from var(--bg-0) l c h / 0.6);
    border-bottom: 1px solid var(--glass-line);
  }
  .ft-grip { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-3); opacity: 0.5; }
  .ft-icon { color: var(--accent); display: inline-flex; }
  .ft-title { font-size: var(--t-sm); color: var(--fg-1); font-weight: 500; letter-spacing: -0.005em; }
  .ft-dot.busy { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.2s infinite; margin-left: 4px; }
  .ft-btn { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--fg-3); }
  .ft-btn:hover { background: var(--bg-2); color: var(--fg-1); }
  .ft-err-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 7px 2px 5px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    background: oklch(from var(--lvl-e-bg) l c h / 0.85);
    color: var(--lvl-e-fg);
    border: 1px solid oklch(from var(--lvl-e-fg) l c h / 0.4);
    margin-left: 6px;
    cursor: pointer;
  }
  .ft-err-pill:hover { background: oklch(from var(--lvl-e-bg) l c h / 1); }
  .ft-body { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .ft-resize { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; color: var(--fg-3); opacity: 0.4; display: flex; align-items: end; justify-content: end; padding: 1px; }
`;

// ── Body wrapper ────────────────────────────────────────────────────────────
function PanelBody({ children, padding = 14, gap = 14, style }) {
  return (
    <div className="sw-body" style={{ padding, gap, ...style }}>
      {children}
      <style>{`
        .sw-body {
          flex: 1;
          min-height: 0;
          display: flex; flex-direction: column;
          overflow: auto;
          /* The outlined fields use this to opaquely mask the border behind their floating label */
          --sc-label-bg: oklch(from var(--bg-1) l c h);
        }
        .sw-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px 16px;
        }
        .sw-displays { display: flex; flex-direction: column; gap: 10px; }
        .sw-inputs { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px 18px; }
        .sw-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
        .sw-readouts { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
      `}</style>
    </div>
  );
}

// ── States ──────────────────────────────────────────────────────────────────

// STATE 1 — Empty (no controls yet)
function EmptyPanel({ w, h }) {
  return (
    <FakeTile title="Scripting" w={w} h={h}>
      <PanelBody padding={20}>
        <div className="empty-script">
          <div className="empty-script-art">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <defs>
                <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
                  <path d="M 8 0 L 0 0 0 8" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
                </pattern>
              </defs>
              <rect x="4" y="4" width="56" height="56" rx="8" fill="url(#grid)" stroke="currentColor" strokeWidth="1" opacity="0.6" />
              <rect x="12" y="14" width="22" height="6" rx="3" fill="currentColor" opacity="0.7" />
              <rect x="38" y="14" width="14" height="6" rx="3" fill="currentColor" opacity="0.4" />
              <rect x="12" y="26" width="40" height="4" rx="2" fill="currentColor" opacity="0.4" />
              <rect x="12" y="34" width="40" height="14" rx="3" fill="currentColor" opacity="0.25" />
              <path d="M 32 38 l 0 6 M 29 41 l 3 -3 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
            </svg>
          </div>
          <h3>Build your control panel</h3>
          <p>Write shell functions, then add inputs and displays that call them. Everything lives in one shared environment.</p>
          <button className="empty-script-cta">
            <Icons.Settings size={12} /> Open settings to build
          </button>
          <div className="empty-script-tip">
            <Icons.Settings size={9} /> Same as the <strong>cog</strong> in this tile's header
          </div>
        </div>
      </PanelBody>
      <style>{`
        .empty-script {
          margin: auto;
          max-width: 320px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center;
          gap: 8px;
          color: var(--fg-3);
          padding: 12px;
        }
        .empty-script-art { color: var(--accent); opacity: 0.7; margin-bottom: 4px; }
        .empty-script h3 { font-size: var(--t-md); color: var(--fg-0); margin: 6px 0 0; font-weight: 600; }
        .empty-script p { font-size: var(--t-sm); color: var(--fg-2); margin: 0; line-height: 1.5; max-width: 280px; }
        .empty-script-cta {
          margin-top: 8px;
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px;
          background: var(--accent);
          color: var(--on-accent);
          border-radius: 7px;
          font-size: var(--t-sm);
          font-weight: 600;
          box-shadow: 0 1px 2px oklch(0 0 0 / 0.2), inset 0 1px 0 oklch(1 0 0 / 0.15);
        }
        .empty-script-tip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 10px;
          color: var(--fg-3);
          background: oklch(from var(--bg-2) l c h / 0.5);
          margin-top: 4px;
        }
        .empty-script-tip strong { color: var(--fg-1); font-weight: 600; }
      `}</style>
    </FakeTile>
  );
}

// STATE 2 — Populated (small tile, "Package toolbox" demo)
function PopulatedSmall({ w, h }) {
  return (
    <FakeTile title="Scripting · Package toolbox" w={w} h={h}>
      <PanelBody>
        <div className="sw-inputs" style={{ gridTemplateColumns: "1fr" }}>
          <ScText label="Package" value="com.example.shopapp" />
        </div>
        <div className="sw-buttons">
          <ScButton label="Force stop" />
          <ScButton label="Clear data" />
          <ScButton label="Info" state="active" />
        </div>
        <div className="sw-displays" style={{ flex: 1, minHeight: 0 }}>
          <ScConsole fn="info" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

// STATE 3 — Populated (large tile, with section groups + descriptions)
function PopulatedLarge({ w, h }) {
  return (
    <FakeTile title="Scripting · Performance lab" w={w} h={h}>
      <PanelBody>
        <ScSection title="At a glance" description="Polled every 2s. Tooltips show source commands." count={4} />
        <div className="sw-readouts">
          <ScGauge label="CPU" value={38} />
          <ScGauge label="GPU" value={62} />
          <ScReadout label="Battery temperature" value="31.2" unit="°C" description="From dumpsys battery; divided by 10 to get °C." />
          <ScReadout label="Frame janky" value="2.06" unit="%" />
        </div>

        <ScSection title="State" count={4} />
        <div className="sw-row">
          <ScStatus label="Charging" state="ok" text="USB · 78%" />
          <ScLED label="Doze" state="off" color="off" />
          <ScLED label="Network" state="on" color="green" />
          <ScStatus label="Thermal" state="warn" text="WARNING" />
        </div>

        <ScSection title="Tunables" description="Changes apply immediately on the device." count={6} />
        <div className="sw-inputs">
          <ScSlider label="Brightness" value={178} max={255} description="0–255. Writes to settings.system.screen_brightness." descInline />
          <ScKnob label="Volume" value={60} description="Media stream volume." />
          <ScSelect label="Doze mode" description="Toggle the device's idle state without unplugging." />
          <ScStepper label="Anim scale" value={1} unit="x" />
        </div>
        <div className="sw-row">
          <ScToggle label="Verbose" value={true} description="Surfaces extra script diagnostics in the console." descInline />
          <ScToggle label="Battery saver" value={false} />
        </div>

        <ScSection title="Actions" count={4} />
        <div className="sw-buttons">
          <ScButton label="Apply" />
          <ScButton label="Reset defaults" confirm description="Confirms before running." />
          <ScButton label="Snapshot" />
          <ScButton label="Screenshot" />
        </div>

        <div className="sw-displays" style={{ flex: 1, minHeight: 200 }}>
          <ScConsole fn="apply" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

// STATE 5b — Script syntax error (header pill)
function ScriptErrorPanel({ w, h }) {
  return (
    <FakeTile title="Scripting · Package toolbox" w={w} h={h} scriptError>
      <PanelBody>
        <div className="sw-inputs" style={{ gridTemplateColumns: "1fr" }}>
          <ScText label="Package" value="com.example.shopapp" />
        </div>
        <div className="sw-buttons">
          <ScButton label="Force stop" />
          <ScButton label="Clear data" confirm description="Confirms before running." />
          <ScButton label="Info" />
        </div>
        <div className="sw-displays" style={{ flex: 1, minHeight: 0 }}>
          <ScConsole empty fn="info" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

// STATE 4 — Mid-run (busy)
function BusyPanel({ w, h }) {
  return (
    <FakeTile title="Scripting · Package toolbox" w={w} h={h} busy>
      <PanelBody>
        <div className="sw-inputs" style={{ gridTemplateColumns: "1fr" }}>
          <ScText label="Package" value="com.example.shopapp" />
        </div>
        <div className="sw-buttons">
          <ScButton label="Force stop" state="busy" />
          <ScButton label="Clear data" />
          <ScButton label="Info" />
        </div>
        <div className="sw-displays" style={{ flex: 1, minHeight: 0 }}>
          <ScConsole fn="force_stop" state="busy" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

// STATE 5 — Error
function ErrorPanel({ w, h }) {
  return (
    <FakeTile title="Scripting · Package toolbox" w={w} h={h}>
      <PanelBody>
        <div className="sw-inputs" style={{ gridTemplateColumns: "1fr" }}>
          <ScText label="Package" value="com.foo.bar" state="error" />
        </div>
        <div className="sw-buttons">
          <ScButton label="Force stop" state="error" />
          <ScButton label="Clear data" />
          <ScButton label="Info" />
        </div>
        <div className="sw-displays" style={{ flex: 1, minHeight: 0 }}>
          <ScConsole fn="force_stop" exit={1} state="error" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

// STATE 6 — Bars hidden (eye toggled)
function BarsHiddenPanel({ w, h }) {
  // For Scripting, "bars hidden" means: hide the console block and the section
  // chrome that helped you build the panel, leaving a clean dashboard-y read.
  return (
    <FakeTile title="Scripting · Performance lab" w={w} h={h} barsHidden>
      <PanelBody>
        <div className="sw-readouts">
          <ScGauge label="CPU" value={38} />
          <ScReadout label="Battery temp" value="31.2" unit="°C" />
          <ScStatus label="Charging" state="ok" text="USB · 78%" />
        </div>
        <div className="sw-inputs">
          <ScSlider label="Brightness" value={178} max={255} />
          <ScKnob label="Volume" value={60} />
        </div>
        <div className="sw-buttons">
          <ScButton label="Apply" />
          <ScButton label="Snapshot" />
        </div>
      </PanelBody>
      <style>{`
        .ft-tile.bars-hidden .sc-section,
        .ft-tile.bars-hidden .sc-console { display: none !important; }
      `}</style>
    </FakeTile>
  );
}

// STATE 7 — Tiny tile (proves reflow under squeeze)
function TinyPanel({ w, h }) {
  return (
    <FakeTile title="Scripting" w={w} h={h}>
      <PanelBody padding={8} gap={6}>
        <ScReadout label="Battery" value="78" unit="%" />
        <div className="sw-buttons">
          <ScButton label="Run" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

// STATE 8 — Sections-focused demo (medium tile)
// Highlights the section heading + description grouping pattern.
function SectionsPanel({ w, h }) {
  return (
    <FakeTile title="Scripting · App debugger" w={w} h={h}>
      <PanelBody>
        <ScSection
          title="Target"
          description="Pick which app and shell to operate on. These inputs feed every action below."
          count={2}
        />
        <ScText label="Package" value="com.example.shopapp" />
        <ScSelect label="User" value="primary (0)" options={["primary (0)", "work (10)"]} />

        <ScSection
          title="Lifecycle"
          description="Non-destructive controls — safe to run repeatedly while debugging."
          count={3}
        />
        <div className="sw-buttons">
          <ScButton label="Force stop" />
          <ScButton label="Start activity" />
          <ScButton label="Info" />
        </div>

        <ScSection
          title="Destructive"
          description="These wipe user state. Tap confirms before running."
          count={2}
        />
        <div className="sw-buttons">
          <ScButton label="Clear data" confirm description="Confirms before running." />
          <ScButton label="Uninstall" confirm description="Confirms before running." />
        </div>

        <div className="sw-displays" style={{ flex: 1, minHeight: 140 }}>
          <ScConsole fn="info" />
        </div>
      </PanelBody>
    </FakeTile>
  );
}

Object.assign(window, {
  FakeTile, PanelBody,
  EmptyPanel, PopulatedSmall, PopulatedLarge,
  BusyPanel, ErrorPanel, ScriptErrorPanel, BarsHiddenPanel, TinyPanel,
  SectionsPanel,
});
