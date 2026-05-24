// Scripting widget — per-control renderers + visual spec for the design canvas.
// Each control supports states: idle / active / busy / error.
// Controls split into INPUTS (carry a value) and DISPLAYS (show output of a function).

// ── Helpers ─────────────────────────────────────────────────────────────────
const slug = (label) =>
  String(label || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || "UNNAMED";

const fnFromLabel = (label) => slug(label).toLowerCase();
const varFromLabel = (label) => "$" + slug(label);

// ── Shared chrome bits ─────────────────────────────────────────────────────
function SpinnerDot({ size = 11 }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1.5px solid var(--bg-3)",
        borderTopColor: "var(--accent)",
        animation: "spin 700ms linear infinite",
        verticalAlign: "middle",
      }}
    />
  );
}

function ControlLabel({ children, description, descInline }) {
  return (
    <div className="sc-lbl">
      <span className="sc-lbl-text">{children}</span>
      {description && !descInline && (
        <span
          className="sc-lbl-info"
          tabIndex={0}
          aria-label={description}
          data-tip={description}
        >
          <Icons.Hash size={9} />
        </span>
      )}
    </div>
  );
}

// ── INPUTS ─────────────────────────────────────────────────────────────────

// 1) Button (action) — runs a function. No value.
function ScButton({ label = "Force stop", state = "idle", run = true, description, confirm }) {
  const busy = state === "busy";
  const err = state === "error";
  const active = state === "active";
  return (
    <button
      className={
        "sc-btn" +
        (active ? " active" : "") +
        (busy ? " busy" : "") +
        (err ? " err" : "")
      }
      data-state={state}
      data-tip={description || undefined}
    >
      {busy ? <SpinnerDot /> : <Icons.PlayCircle size={12} />}
      <span>{label}</span>
      {confirm && !busy && !err && <Icons.Lock size={10} />}
      {err && <span className="sc-btn-exit">exit 1</span>}
    </button>
  );
}

// 2) Toggle
function ScToggle({ label = "Verbose", value = true, state = "idle", description, descInline }) {
  const err = state === "error";
  const busy = state === "busy";
  return (
    <div className={"sc-toggle-row" + (err ? " err" : "") + (descInline && description ? " with-desc" : "")}>
      <div className="sc-toggle-lbl">
        <ControlLabel description={description} descInline={descInline}>{label}</ControlLabel>
        {descInline && description && (
          <div className="sc-desc-inline">{description}</div>
        )}
      </div>
      <div className="sc-toggle-end">
        {busy && <SpinnerDot size={10} />}
        <button className={"sc-tg " + (value ? "on" : "")}>
          <span className="sc-tg-dot" />
        </button>
      </div>
    </div>
  );
}

// 3) Slider
function ScSlider({
  label = "Brightness",
  min = 0,
  max = 255,
  step = 1,
  value = 178,
  unit = "",
  state = "idle",
  description,
  descInline,
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const err = state === "error";
  const busy = state === "busy";
  return (
    <div className={"sc-slider" + (err ? " err" : "")}>
      <div className="sc-slider-head">
        <ControlLabel description={description} descInline={descInline}>{label}</ControlLabel>
        <span className="sc-val">
          {value}
          {unit && <span className="sc-unit">{unit}</span>}
          {busy && (
            <span style={{ marginLeft: 6 }}>
              <SpinnerDot size={9} />
            </span>
          )}
        </span>
      </div>
      {descInline && description && <div className="sc-desc-inline">{description}</div>}
      <div className="sc-track">
        <div className="sc-fill" style={{ width: pct + "%" }} />
        <div className="sc-thumb" style={{ left: `calc(${pct}% - 7px)` }} />
      </div>
      <div className="sc-range">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// 4) Text field
function ScText({
  label = "Package name",
  value = "com.example.shopapp",
  placeholder = "com.example.app",
  state = "idle",
  description,
  descInline,
}) {
  const err = state === "error";
  const active = state === "active";
  return (
    <div className={"sc-text" + (err ? " err" : "") + (active ? " active" : "")}>
      <ControlLabel description={description} descInline={descInline}>{label}</ControlLabel>
      <div className="sc-text-input">
        <input
          defaultValue={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {descInline && description && <div className="sc-desc-inline">{description}</div>}
    </div>
  );
}

// 5) Select / dropdown
function ScSelect({
  label = "Doze mode",
  value = "active",
  options = ["active", "idle", "deep"],
  state = "idle",
  description,
  descInline,
}) {
  return (
    <div className={"sc-select" + (state === "error" ? " err" : "")}>
      <ControlLabel description={description} descInline={descInline}>{label}</ControlLabel>
      <div className="sc-select-input">
        <span>{value}</span>
        <Icons.Chevron size={11} />
        <select defaultValue={value}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {descInline && description && <div className="sc-desc-inline">{description}</div>}
    </div>
  );
}

// 6) Number stepper
function ScStepper({
  label = "Animation scale",
  value = 1.0,
  step = 0.1,
  min = 0,
  max = 5,
  unit = "x",
  state = "idle",
  description,
  descInline,
}) {
  return (
    <div className={"sc-step" + (state === "error" ? " err" : "")}>
      <ControlLabel description={description} descInline={descInline}>{label}</ControlLabel>
      <div className="sc-step-input">
        <button className="sc-step-btn">−</button>
        <span className="sc-step-val">
          {value}
          {unit && <span className="sc-unit">{unit}</span>}
        </span>
        <button className="sc-step-btn">+</button>
      </div>
      {descInline && description && <div className="sc-desc-inline">{description}</div>}
    </div>
  );
}

// 7) Knob (rotary slider)
function ScKnob({
  label = "Volume",
  value = 60,
  min = 0,
  max = 100,
  unit = "%",
  state = "idle",
  description,
}) {
  // Sweep from -135° to +135° (270° sweep)
  const t = (value - min) / (max - min);
  const a0 = -135;
  const a1 = -135 + 270;
  const cur = a0 + 270 * t;
  // build arc
  const r = 22;
  const cx = 30;
  const cy = 30;
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(a0);
  const [ex, ey] = toXY(cur);
  const [fx, fy] = toXY(a1);
  const largeBg = a1 - a0 > 180 ? 1 : 0;
  const largeFg = cur - a0 > 180 ? 1 : 0;
  const pointerR = 12;
  const [px, py] = toXY(cur);
  const err = state === "error";
  const busy = state === "busy";
  return (
    <div className={"sc-knob" + (err ? " err" : "")}>
      <svg width="60" height="60" viewBox="0 0 60 60">
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeBg} 1 ${fx} ${fy}`}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeFg} 1 ${ex} ${ey}`}
          fill="none"
          stroke={err ? "var(--lvl-e-fg)" : "var(--accent)"}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle
          cx={cx}
          cy={cy}
          r={pointerR}
          fill="var(--bg-1)"
          stroke="var(--line)"
          strokeWidth="1"
        />
        <line
          x1={cx}
          y1={cy}
          x2={cx + (px - cx) * 0.55}
          y2={cy + (py - cy) * 0.55}
          stroke="var(--fg-0)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <div className="sc-knob-meta">
        <div className="sc-knob-val">
          {Math.round(value)}
          {unit && <span className="sc-unit">{unit}</span>}
          {busy && (
            <span style={{ marginLeft: 6 }}>
              <SpinnerDot size={9} />
            </span>
          )}
        </div>
        <div className="sc-knob-label" data-tip={description || undefined}>
          {label}
          {description && (
            <span className="sc-lbl-info" style={{ marginLeft: 4 }}>
              <Icons.Hash size={9} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DISPLAYS ────────────────────────────────────────────────────────────────

// Console — most-recent run; stdout/stderr; exit code chip
function ScConsole({
  state = "idle",
  fn = "package_info",
  exit = 0,
  lines = null,
  empty = false,
  copied = false,
}) {
  const busy = state === "busy";
  const err = state === "error" || exit !== 0;
  const defaultLines = empty
    ? []
    : err
    ? [
        { kind: "cmd", text: `$ ${fn}` },
        { kind: "err", text: "Error: package com.foo.bar not found" },
        { kind: "err", text: "  at PackageManagerService.getPackageInfo:1284" },
      ]
    : [
        { kind: "cmd", text: `$ ${fn}` },
        { kind: "out", text: "Package: com.example.shopapp" },
        { kind: "out", text: "  versionName=4.2.1  versionCode=4210" },
        { kind: "out", text: "  installer=com.android.vending" },
        { kind: "out", text: "  firstInstallTime=2024-09-04 11:02" },
      ];
  const display = lines || defaultLines;
  return (
    <div className="sc-console">
      <div className="sc-console-head">
        <span className="sc-console-glyph">
          <Icons.Terminal size={11} />
        </span>
        <span className="sc-console-title">console</span>
        <span style={{ flex: 1 }} />
        {busy ? (
          <span className="sc-exit busy">
            <SpinnerDot size={8} /> running…
          </span>
        ) : empty ? (
          <span className="sc-exit idle">— no runs yet</span>
        ) : (
          <span className={"sc-exit " + (err ? "err" : "ok")}>
            <span className="sc-exit-dot" /> exit {exit}
          </span>
        )}
        {!empty && !busy && (
          <button className={"sc-console-copy" + (copied ? " done" : "")} data-tip={copied ? "Copied" : "Copy output"}>
            {copied ? <Icons.Check size={11} /> : <Icons.Copy size={11} />}
          </button>
        )}
      </div>
      <div className="sc-console-body">
        {display.length === 0 && (
          <div className="sc-console-empty">
            Output from the most recent run appears here.
          </div>
        )}
        {display.map((l, i) => (
          <div key={i} className={"sc-console-line k-" + l.kind}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// Status pill
function ScStatus({ label = "Network", state = "ok", text = "OK" }) {
  const isOk = state === "ok";
  const isBusy = state === "busy";
  return (
    <div className={"sc-status " + state}>
      <span className="sc-status-dot" />
      <span className="sc-status-text">
        <span className="sc-status-label">{label}</span>
        {isBusy ? (
          <span className="sc-status-val">checking…</span>
        ) : (
          <span className="sc-status-val">{text}</span>
        )}
      </span>
      {isBusy && <SpinnerDot size={9} />}
    </div>
  );
}

// Value readout
function ScReadout({
  label = "Battery temperature",
  value = "31.2",
  unit = "°C",
  state = "ok",
  stale = false,
  description,
}) {
  return (
    <div className={"sc-readout " + state + (stale ? " stale" : "")} data-tip={description || undefined}>
      <div className="sc-readout-row">
        <span className="sc-readout-val">{value}</span>
        {unit && <span className="sc-readout-unit">{unit}</span>}
      </div>
      <div className="sc-readout-label">
        {label}
        {stale && <span className="sc-readout-stale"><SpinnerDot size={7} /> refreshing</span>}
      </div>
    </div>
  );
}

// Gauge — SVG arc, min/max, current value
function ScGauge({
  label = "CPU",
  value = 38,
  min = 0,
  max = 100,
  unit = "%",
  state = "ok",
}) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const a0 = -120;
  const a1 = 120;
  const cur = a0 + (a1 - a0) * t;
  const r = 38;
  const cx = 50;
  const cy = 52;
  const toXY = (deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(a0);
  const [ex, ey] = toXY(cur);
  const [fx, fy] = toXY(a1);
  const largeBg = a1 - a0 > 180 ? 1 : 0;
  const largeFg = cur - a0 > 180 ? 1 : 0;
  const color =
    state === "err"
      ? "var(--lvl-e-fg)"
      : t > 0.85
      ? "var(--lvl-w-fg)"
      : "var(--accent)";
  return (
    <div className={"sc-gauge " + state}>
      <svg width="100" height="70" viewBox="0 0 100 70">
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeBg} 1 ${fx} ${fy}`}
          fill="none"
          stroke="var(--bg-3)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${largeFg} 1 ${ex} ${ey}`}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          style={{ transition: "all 360ms var(--ease-out)" }}
        />
        <text
          x="50"
          y="48"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="var(--fg-0)"
          fontFamily="var(--font-mono)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {Math.round(value)}
          <tspan fontSize="10" fill="var(--fg-3)" dx="1">
            {unit}
          </tspan>
        </text>
        <text
          x={sx - 2}
          y={sy + 9}
          textAnchor="end"
          fontSize="8"
          fill="var(--fg-3)"
          fontFamily="var(--font-mono)"
        >
          {min}
        </text>
        <text
          x={fx + 2}
          y={fy + 9}
          textAnchor="start"
          fontSize="8"
          fill="var(--fg-3)"
          fontFamily="var(--font-mono)"
        >
          {max}
        </text>
      </svg>
      <div className="sc-gauge-label">{label}</div>
    </div>
  );
}

// LED / indicator
function ScLED({ label = "Charging", state = "on", color = "green" }) {
  // color: green | amber | red | blue | off
  return (
    <div className={"sc-led " + state}>
      <span className={"sc-led-bulb led-" + color} />
      <div className="sc-led-meta">
        <div className="sc-led-label">{label}</div>
        <div className="sc-led-state">{state}</div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
// Section heading — a non-interactive grouping control.
function ScSection({ title = "Display", description, count }) {
  return (
    <div className="sc-section">
      <div className="sc-section-bar" />
      <div className="sc-section-meta">
        <div className="sc-section-head">
          <span className="sc-section-title">{title}</span>
          {count != null && <span className="sc-section-count">{count}</span>}
        </div>
        {description && <div className="sc-section-desc">{description}</div>}
      </div>
    </div>
  );
}

const SC_STYLES = `
  .sc-lbl { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .sc-lbl-text {
    font-size: var(--t-sm);
    color: var(--fg-1);
    font-weight: 500;
    letter-spacing: -0.005em;
  }
  .sc-lbl-info {
    display: inline-flex; align-items: center; justify-content: center;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: oklch(from var(--fg-3) l c h / 0.2);
    color: var(--fg-3);
    cursor: help;
    transition: background 120ms, color 120ms;
    font-family: var(--font-mono);
  }
  .sc-lbl-info:hover { background: oklch(from var(--accent) l c h / 0.2); color: var(--accent); }
  .sc-lbl-info svg { transform: scale(0.85); }
  .sc-lbl-desc { font-size: var(--t-xs); color: var(--fg-3); flex: 1; min-width: 0; }
  .sc-desc-inline {
    margin-top: 6px;
    font-size: var(--t-xs);
    color: var(--fg-3);
    line-height: 1.45;
  }

  /* Tooltip (data-tip) — pure CSS, shows on hover/focus */
  [data-tip] { position: relative; }
  [data-tip]:hover::after,
  [data-tip]:focus-visible::after {
    content: attr(data-tip);
    position: absolute;
    z-index: 100;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: oklch(from var(--bg-0) calc(l - 0.04) c h);
    color: var(--fg-0);
    border: 1px solid var(--glass-line);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: var(--t-xs);
    font-family: var(--font-mono);
    max-width: 240px;
    width: max-content;
    white-space: normal;
    line-height: 1.45;
    box-shadow: 0 4px 14px oklch(0 0 0 / 0.45);
    pointer-events: none;
    animation: tip-in 140ms var(--ease-out);
  }
  @keyframes tip-in { from { opacity: 0; transform: translateX(-50%) translateY(2px); } }
  .sc-val {
    font-variant-numeric: tabular-nums;
    font-size: var(--t-sm);
    color: var(--fg-0);
    font-weight: 600;
  }
  .sc-unit { color: var(--fg-3); font-weight: 400; margin-left: 1px; font-size: var(--t-xs); }

  /* Button */
  .sc-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 0 12px;
    height: 30px;
    border-radius: 7px;
    background: var(--bg-2);
    border: 1px solid var(--glass-line);
    color: var(--fg-0);
    font-size: var(--t-sm);
    transition: background-color 120ms, transform 120ms, border-color 120ms;
    white-space: nowrap;
  }
  .sc-btn:hover { background: var(--bg-3); }
  .sc-btn:active { transform: scale(0.97); }
  .sc-btn.active { background: oklch(from var(--accent) l c h / 0.16); border-color: oklch(from var(--accent) l c h / 0.4); color: var(--accent-fg); }
  .sc-btn.busy { color: var(--fg-2); }
  .sc-btn.err { border-color: oklch(from var(--lvl-e-fg) l c h / 0.5); background: oklch(from var(--lvl-e-fg) l c h / 0.06); color: var(--lvl-e-fg); }
  .sc-btn-exit {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: oklch(from var(--lvl-e-fg) l c h / 0.18);
    color: var(--lvl-e-fg);
    margin-left: 2px;
  }
  .sc-btn svg { opacity: 0.8; }
  .sc-btn .sc-lbl-info { width: 12px; height: 12px; }

  /* Toggle — keep outlined surface so it reads as a discrete switch */
  .sc-toggle-row {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    background: oklch(from var(--bg-1) l c h / 0.5);
    border: 1px solid var(--glass-line);
  }
  .sc-toggle-row .sc-lbl { min-width: 0; }
  .sc-toggle-lbl { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .sc-toggle-lbl .sc-desc-inline { margin-top: 2px; }
  .sc-toggle-row.err { border-color: oklch(from var(--lvl-e-fg) l c h / 0.45); }
  .sc-toggle-row.err .sc-tg { background: var(--lvl-e-fg); }
  .sc-toggle-end { display: inline-flex; align-items: center; gap: 8px; align-self: center; }
  .sc-tg {
    width: 32px; height: 18px;
    border-radius: 999px;
    background: var(--bg-3);
    position: relative;
    transition: background-color 160ms var(--ease-out);
  }
  .sc-tg.on { background: var(--accent); }
  .sc-tg-dot {
    position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--fg-0);
    transition: transform 160ms var(--ease-spring);
  }
  .sc-tg.on .sc-tg-dot { transform: translateX(14px); background: var(--on-accent); }

  /* Slider */
  .sc-slider {
    padding: 2px 0;
  }
  .sc-slider.err { /* error reflects in the fill + thumb colors */ }
  .sc-slider-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .sc-slider .sc-desc-inline { margin: 0 0 10px; }
  .sc-track {
    position: relative;
    height: 4px;
    background: var(--bg-3);
    border-radius: 2px;
  }
  .sc-fill {
    position: absolute; left: 0; top: 0; bottom: 0;
    background: var(--accent);
    border-radius: 2px;
    transition: width 200ms var(--ease-out);
  }
  .sc-slider.err .sc-fill { background: var(--lvl-e-fg); }
  .sc-thumb {
    position: absolute;
    top: 50%; transform: translateY(-50%);
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--fg-0);
    border: 2px solid var(--accent);
    box-shadow: 0 1px 4px oklch(0 0 0 / 0.3);
    transition: left 200ms var(--ease-out);
  }
  .sc-slider.err .sc-thumb { border-color: var(--lvl-e-fg); }
  .sc-range {
    display: flex; justify-content: space-between;
    margin-top: 6px;
    font-size: 10px;
    color: var(--fg-3);
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  /* Text field — material-outlined: label floats over the top border */
  .sc-text {
    position: relative;
    padding: 8px 0 2px;
    display: flex; flex-direction: column;
  }
  .sc-text > .sc-lbl {
    position: absolute;
    top: 1px;
    left: 10px;
    padding: 0 6px;
    z-index: 1;
    line-height: 1;
    background: var(--sc-label-bg, oklch(from var(--bg-1) l c h));
    border-radius: 3px;
    pointer-events: none;
  }
  .sc-text > .sc-lbl .sc-lbl-text { font-size: 11px; letter-spacing: 0.01em; color: var(--fg-2); }
  .sc-text-input {
    margin-top: 0;
    display: flex;
    background: transparent;
    border: 1px solid var(--glass-line);
    border-radius: 6px;
    padding: 0 12px;
    height: 38px;
  }
  .sc-text-input input {
    flex: 1;
    background: transparent;
    border: 0; outline: 0;
    color: var(--fg-0);
    font-family: var(--font-mono);
    font-size: var(--t-sm);
  }
  .sc-text-input input::placeholder { color: var(--fg-3); }
  .sc-text.active > .sc-lbl .sc-lbl-text,
  .sc-text:focus-within > .sc-lbl .sc-lbl-text { color: var(--accent-fg); }
  .sc-text.active .sc-text-input,
  .sc-text:focus-within .sc-text-input { border-color: oklch(from var(--accent) l c h / 0.55); }
  .sc-text.err .sc-text-input { border-color: oklch(from var(--lvl-e-fg) l c h / 0.55); }
  .sc-text.err > .sc-lbl .sc-lbl-text { color: var(--lvl-e-fg); }

  /* Select — material-outlined */
  .sc-select {
    position: relative;
    padding: 8px 0 2px;
    display: flex; flex-direction: column;
  }
  .sc-select > .sc-lbl {
    position: absolute;
    top: 1px;
    left: 10px;
    padding: 0 6px;
    z-index: 1;
    line-height: 1;
    background: var(--sc-label-bg, oklch(from var(--bg-1) l c h));
    border-radius: 3px;
    pointer-events: none;
  }
  .sc-select > .sc-lbl .sc-lbl-text { font-size: 11px; letter-spacing: 0.01em; color: var(--fg-2); }
  .sc-select-input {
    position: relative;
    margin-top: 0;
    display: flex; align-items: center;
    background: transparent;
    border: 1px solid var(--glass-line);
    border-radius: 6px;
    padding: 0 12px;
    height: 38px;
    color: var(--fg-0);
    font-family: var(--font-mono);
    font-size: var(--t-sm);
  }
  .sc-select-input span { flex: 1; }
  .sc-select-input select {
    position: absolute; inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .sc-select.err .sc-select-input { border-color: oklch(from var(--lvl-e-fg) l c h / 0.55); }
  .sc-select.err > .sc-lbl .sc-lbl-text { color: var(--lvl-e-fg); }

  /* Stepper — material-outlined */
  .sc-step {
    position: relative;
    padding: 8px 0 2px;
    display: flex; flex-direction: column;
  }
  .sc-step > .sc-lbl {
    position: absolute;
    top: 1px;
    left: 10px;
    padding: 0 6px;
    z-index: 1;
    line-height: 1;
    background: var(--sc-label-bg, oklch(from var(--bg-1) l c h));
    border-radius: 3px;
    pointer-events: none;
  }
  .sc-step > .sc-lbl .sc-lbl-text { font-size: 11px; letter-spacing: 0.01em; color: var(--fg-2); }
  .sc-step-input {
    margin-top: 0;
    display: flex; align-items: center; gap: 0;
    background: transparent;
    border: 1px solid var(--glass-line);
    border-radius: 6px;
    height: 38px;
    overflow: hidden;
  }
  .sc-step.err .sc-step-input { border-color: oklch(from var(--lvl-e-fg) l c h / 0.55); }
  .sc-step.err > .sc-lbl .sc-lbl-text { color: var(--lvl-e-fg); }
  .sc-step-btn {
    width: 30px; height: 100%;
    color: var(--fg-1);
    font-size: 16px;
    line-height: 1;
    transition: background 120ms;
  }
  .sc-step-btn:hover { background: var(--bg-2); color: var(--fg-0); }
  .sc-step-val {
    flex: 1;
    text-align: center;
    color: var(--fg-0);
    font-family: var(--font-mono);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    border-left: 1px solid var(--glass-line);
    border-right: 1px solid var(--glass-line);
    height: 100%;
    display: inline-flex; align-items: center; justify-content: center;
  }

  /* Knob */
  .sc-knob {
    display: flex; align-items: center; gap: 12px;
    padding: 2px 0;
  }
  .sc-knob-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .sc-knob-val {
    font-size: var(--t-md);
    font-weight: 700;
    color: var(--fg-0);
    font-variant-numeric: tabular-nums;
  }
  .sc-knob-label { font-size: var(--t-sm); color: var(--fg-1); font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }

  /* Console */
  .sc-console {
    display: flex; flex-direction: column;
    background: oklch(from var(--bg-0) calc(l - 0.02) c h);
    border: 1px solid var(--glass-line);
    border-radius: 8px;
    overflow: hidden;
    min-height: 0;
  }
  .sc-console-head {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px;
    background: oklch(from var(--bg-1) l c h / 0.5);
    border-bottom: 1px solid var(--glass-line);
    font-size: var(--t-xs);
    color: var(--fg-3);
    letter-spacing: 0.08em;
  }
  .sc-console-title {
    text-transform: uppercase;
    color: var(--fg-3);
    letter-spacing: 0.14em;
    font-size: 10px;
  }
  .sc-console-glyph { color: var(--fg-2); display: inline-flex; }
  .sc-exit {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    letter-spacing: 0.05em;
    font-variant-numeric: tabular-nums;
  }
  .sc-exit.ok { background: oklch(from var(--lvl-i-bg) l c h / 0.7); color: var(--lvl-i-fg); }
  .sc-exit.ok .sc-exit-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--lvl-i-fg); }
  .sc-exit.err { background: oklch(from var(--lvl-e-bg) l c h / 0.85); color: var(--lvl-e-fg); }
  .sc-exit.err .sc-exit-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--lvl-e-fg); }
  .sc-exit.busy { background: oklch(from var(--bg-2) l c h); color: var(--fg-2); }
  .sc-exit.idle { background: transparent; color: var(--fg-3); font-style: italic; padding: 2px 0; }
  .sc-console-body {
    padding: 8px 10px;
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    line-height: 1.55;
    color: var(--fg-1);
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .sc-console-line { white-space: pre-wrap; word-break: break-all; }
  .sc-console-line.k-cmd { color: var(--accent-fg); }
  .sc-console-line.k-out { color: var(--fg-1); }
  .sc-console-line.k-err { color: var(--lvl-e-fg); }
  .sc-console-empty { color: var(--fg-3); font-style: italic; font-family: var(--font-mono); font-size: var(--t-xs); }
  .sc-console-copy {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 20px;
    border-radius: 4px;
    color: var(--fg-3);
    margin-left: 4px;
    transition: background 120ms, color 120ms;
  }
  .sc-console-copy:hover { background: var(--bg-2); color: var(--fg-0); }
  .sc-console-copy.done { color: var(--lvl-i-fg); background: oklch(from var(--lvl-i-fg) l c h / 0.15); }

  /* Status pill */
  .sc-status {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: oklch(from var(--bg-1) l c h / 0.5);
    border: 1px solid var(--glass-line);
  }
  .sc-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .sc-status.ok .sc-status-dot { background: var(--lvl-i-fg); box-shadow: 0 0 0 3px oklch(from var(--lvl-i-fg) l c h / 0.2); }
  .sc-status.err .sc-status-dot { background: var(--lvl-e-fg); box-shadow: 0 0 0 3px oklch(from var(--lvl-e-fg) l c h / 0.2); }
  .sc-status.busy .sc-status-dot { background: var(--fg-3); }
  .sc-status.warn .sc-status-dot { background: var(--lvl-w-fg); box-shadow: 0 0 0 3px oklch(from var(--lvl-w-fg) l c h / 0.2); }
  .sc-status-text { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
  .sc-status-label { font-size: 10px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.1em; }
  .sc-status-val { font-size: var(--t-sm); color: var(--fg-0); font-weight: 500; }
  .sc-status.err .sc-status-val { color: var(--lvl-e-fg); }
  .sc-status.ok .sc-status-val { color: var(--lvl-i-fg); }

  /* Readout */
  .sc-readout {
    display: flex; flex-direction: column;
    padding: 10px 14px;
    border-radius: 8px;
    background: oklch(from var(--bg-1) l c h / 0.5);
    border: 1px solid var(--glass-line);
    min-width: 0;
  }
  .sc-readout-row { display: flex; align-items: baseline; gap: 3px; }
  .sc-readout-val {
    font-size: 22px;
    font-weight: 700;
    color: var(--fg-0);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    letter-spacing: -0.01em;
  }
  .sc-readout-unit { font-size: var(--t-sm); color: var(--fg-3); font-weight: 500; }
  .sc-readout-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fg-3);
    margin-top: 4px;
  }
  .sc-readout.warn .sc-readout-val { color: var(--lvl-w-fg); }
  .sc-readout.err .sc-readout-val { color: var(--lvl-e-fg); }
  .sc-readout.stale .sc-readout-val { opacity: 0.55; transition: opacity 200ms; }
  .sc-readout-label {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .sc-readout-stale {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 9px;
    text-transform: none; letter-spacing: 0.04em;
    color: var(--fg-3);
    font-family: var(--font-mono);
  }

  /* Section heading — groups controls into labelled chunks */
  .sc-section {
    display: flex; flex-direction: column;
    gap: 8px;
    padding: 14px 0 6px;
    margin-top: 16px;
  }
  .sc-section:first-child { margin-top: 4px; }
  .sc-section-bar { display: none; }
  .sc-section-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .sc-section-head { display: inline-flex; align-items: baseline; gap: 8px; }
  .sc-section-title {
    font-size: var(--t-md);
    color: var(--fg-0);
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .sc-section-count { display: none; }
  .sc-section-desc {
    font-size: var(--t-xs);
    color: var(--fg-3);
    line-height: 1.5;
  }

  /* Gauge */
  .sc-gauge {
    display: flex; flex-direction: column; align-items: center;
    padding: 8px 10px 10px;
    border-radius: 8px;
    background: oklch(from var(--bg-1) l c h / 0.5);
    border: 1px solid var(--glass-line);
  }
  .sc-gauge-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fg-3);
    margin-top: -4px;
  }

  /* LED */
  .sc-led {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: oklch(from var(--bg-1) l c h / 0.5);
    border: 1px solid var(--glass-line);
  }
  .sc-led-bulb {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--bg-3);
    flex-shrink: 0;
  }
  .sc-led-bulb.led-green { background: var(--lvl-i-fg); box-shadow: 0 0 8px oklch(from var(--lvl-i-fg) l c h / 0.7); }
  .sc-led-bulb.led-amber { background: var(--lvl-w-fg); box-shadow: 0 0 8px oklch(from var(--lvl-w-fg) l c h / 0.7); }
  .sc-led-bulb.led-red   { background: var(--lvl-e-fg); box-shadow: 0 0 8px oklch(from var(--lvl-e-fg) l c h / 0.7); }
  .sc-led-bulb.led-blue  { background: oklch(0.74 0.13 220); box-shadow: 0 0 8px oklch(0.74 0.13 220 / 0.7); }
  .sc-led-bulb.led-off   { background: var(--bg-3); }
  .sc-led-meta { display: flex; flex-direction: column; line-height: 1.2; }
  .sc-led-label { font-size: var(--t-sm); color: var(--fg-0); font-weight: 500; }
  .sc-led-state { font-size: 10px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.1em; }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Performance mode: drop backdrop blur + animations */
  [data-perf="on"] .sc-btn,
  [data-perf="on"] .sc-fill,
  [data-perf="on"] .sc-thumb,
  [data-perf="on"] .sc-tg,
  [data-perf="on"] .sc-tg-dot {
    transition: none !important;
  }
  [data-perf="on"] .sc-console,
  [data-perf="on"] .sc-status,
  [data-perf="on"] .sc-readout,
  [data-perf="on"] .sc-toggle-row,
  [data-perf="on"] .sc-slider,
  [data-perf="on"] .sc-text,
  [data-perf="on"] .sc-select,
  [data-perf="on"] .sc-step,
  [data-perf="on"] .sc-knob,
  [data-perf="on"] .sc-gauge,
  [data-perf="on"] .sc-led {
    backdrop-filter: none !important;
  }
`;

Object.assign(window, {
  ScButton, ScToggle, ScSlider, ScText, ScSelect, ScStepper, ScKnob,
  ScConsole, ScStatus, ScReadout, ScGauge, ScLED, ScSection,
  SpinnerDot, slug, fnFromLabel, varFromLabel,
  SC_STYLES,
});
