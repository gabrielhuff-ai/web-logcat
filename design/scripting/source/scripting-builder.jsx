// Scripting widget — Settings modal (the BUILDER).
// Layout: two-pane horizontal.
//   LEFT (~60%)  — script editor (always visible), with a "Run as root" toggle
//                  and a "Available variables/functions" legend.
//   RIGHT (~40%) — controls list (compact, top) + per-control config (below, scrollable).
// A vertical resize handle lets the user adjust the split; a collapse button
// folds the right pane to give the script all the width.

const SAMPLE_SCRIPT = String.raw`#!/system/bin/sh
# Each Scripting widget owns one shell script and one persistent env.
# Input controls export their value as env vars. Action buttons and bound
# displays call functions defined below.

set_brightness() {
  settings put system screen_brightness "$BRIGHTNESS"
}

force_stop() {
  am force-stop "$PACKAGE"
}

clear_data() {
  pm clear "$PACKAGE"
}

info() {
  dumpsys package "$PACKAGE" | grep -E 'versionName|firstInstallTime' | head -5
}

battery_temp() {
  # Bound to the "Battery temperature" readout. Polled every 2s.
  T=$(dumpsys battery | awk '/temperature/ {print $2}')
  echo "scale=1; $T / 10" | bc
}

cpu() {
  top -bn1 | awk '/^[0-9]+%cpu/ {print $1}' | tr -d '%cpu'
}`;

function BuilderModal({
  w = 1200,
  h = 760,
  selectedKind = "button",         // button | text | slider | console | section
  paneSplit = 60,                  // 35..80 — left pane width %
  controlsCollapsed = false,
  runAsRoot = false,
}) {
  const controlList = [
    { id: "sec1", kind: "section", label: "Inputs",   derived: "— heading —" },
    { id: "c1",   kind: "text",    label: "Package",  derived: "$PACKAGE" },
    { id: "c2",   kind: "slider",  label: "Brightness", derived: "$BRIGHTNESS" },
    { id: "c3",   kind: "toggle",  label: "Verbose",  derived: "$VERBOSE" },
    { id: "sec2", kind: "section", label: "Actions",  derived: "— heading —" },
    { id: "c4",   kind: "button",  label: "Force stop", derived: "force_stop()", action: true },
    { id: "c5",   kind: "button",  label: "Clear data", derived: "clear_data()", action: true },
    { id: "c6",   kind: "button",  label: "Info",     derived: "info()", action: true },
    { id: "sec3", kind: "section", label: "Output",   derived: "— heading —" },
    { id: "c7",   kind: "console", label: "Console",  derived: "bound: last run" },
    { id: "c8",   kind: "readout", label: "Battery temperature", derived: "battery_temp()" },
  ];

  // Pick which control to highlight based on selectedKind so reviewers can
  // see different config-form variants by passing a prop.
  const SELECT_BY_KIND = {
    button: "c4", text: "c1", slider: "c2", toggle: "c3",
    console: "c7", readout: "c8", section: "sec1",
  };
  const selectedId = SELECT_BY_KIND[selectedKind] || "c4";
  const selected = controlList.find(c => c.id === selectedId);

  // Effective split — if collapsed, left takes everything.
  const left = controlsCollapsed ? 100 : paneSplit;

  return (
    <div className="bdr-modal" style={{ width: w, height: h }}>
      {/* Header */}
      <div className="bdr-head">
        <span className="bdr-head-icon"><Icons.Wand size={14} /></span>
        <div className="bdr-head-titles">
          <div className="bdr-head-title">Scripting · settings</div>
          <div className="bdr-head-sub">Build your panel — script and controls share one shell environment</div>
        </div>
        <span style={{ flex: 1 }} />
        <button className="bdr-pillbtn ghost">Discard</button>
        <button className="bdr-pillbtn primary">Save panel</button>
        <button className="bdr-close"><Icons.Close size={13} /></button>
      </div>

      <div className="bdr-body" style={{ gridTemplateColumns: controlsCollapsed ? "1fr 0px" : `${left}% ${100 - left}%` }}>
        {/* ── LEFT pane: script + legend ─────────────────────────── */}
        <div className="bdr-left">
          <div className="bdr-section-head">
            <span>Shell script</span>
            <span className="bdr-mini-hint"><Icons.Terminal size={10} /> mksh · POSIX-ish</span>

            <label className={"bdr-root-toggle" + (runAsRoot ? " on" : "")} data-tip="Run as root (su). Falls back to user shell if su is unavailable.">
              <span className="bdr-root-text">Run as root</span>
              <span className={"bdr-root-tg " + (runAsRoot ? "on" : "")}>
                <span className="bdr-root-tg-dot" />
              </span>
            </label>
          </div>

          <div className="bdr-editor">
            <div className="bdr-editor-gutter">
              {SAMPLE_SCRIPT.split("\n").map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="bdr-editor-text"><code>{highlight(SAMPLE_SCRIPT)}</code></pre>
          </div>

          <div className="bdr-legend">
            <div className="bdr-legend-head">
              <Icons.Hash size={10} /> Available variables
              <span className="bdr-legend-count">3</span>
            </div>
            <div className="bdr-legend-chips">
              <code className="bdr-chip" data-tip="From the &quot;Package&quot; text input.">$PACKAGE</code>
              <code className="bdr-chip" data-tip="From the &quot;Brightness&quot; slider.">$BRIGHTNESS</code>
              <code className="bdr-chip" data-tip="From the &quot;Verbose&quot; toggle.">$VERBOSE</code>
            </div>
            <div className="bdr-legend-head" style={{ marginTop: 10 }}>
              <Icons.PlayCircle size={10} /> Functions
              <span className="bdr-legend-count">5</span>
            </div>
            <div className="bdr-legend-chips">
              <code className="bdr-chip fn">set_brightness()</code>
              <code className="bdr-chip fn">force_stop()</code>
              <code className="bdr-chip fn">clear_data()</code>
              <code className="bdr-chip fn">info()</code>
              <code className="bdr-chip fn">battery_temp()</code>
            </div>
          </div>
        </div>

        {/* ── Resize handle ────────────────────────────────────────── */}
        {!controlsCollapsed && (
          <div className="bdr-resizer" data-tip="Drag to resize" aria-orientation="vertical" role="separator">
            <span className="bdr-resizer-grip">
              <span /><span /><span />
            </span>
          </div>
        )}

        {/* ── RIGHT pane: controls + config ────────────────────────── */}
        {!controlsCollapsed && (
          <div className="bdr-right">
            <div className="bdr-section-head">
              <span>Controls <span style={{ color: "var(--fg-3)" }}>· {controlList.length}</span></span>
              <span style={{ flex: 1 }} />
              <button className="bdr-mini-btn" data-tip="Collapse to give the script editor the full width"><Icons.ChevronRight size={11} /></button>
              <button className="bdr-mini-btn primary"><Icons.Plus size={11} /> Add</button>
            </div>

            <div className="bdr-ctrl-list">
              {controlList.map(c => (
                <div
                  key={c.id}
                  className={"bdr-ctrl-row" + (c.id === selectedId ? " selected" : "") + (c.kind === "section" ? " is-section" : "")}
                >
                  <span className="bdr-ctrl-drag"><Icons.Drag size={11} /></span>
                  <span className={"bdr-ctrl-kind kind-" + c.kind}><CtrlIcon kind={c.kind} /></span>
                  <span className="bdr-ctrl-label">{c.label}</span>
                  <span className="bdr-ctrl-derived">{c.derived}</span>
                  <button className="bdr-ctrl-del"><Icons.Trash size={11} /></button>
                </div>
              ))}
            </div>

            <div className="bdr-config-head">
              <span>Edit:</span>
              <span className={"bdr-ctrl-kind kind-" + selected.kind}><CtrlIcon kind={selected.kind} /></span>
              <span className="bdr-config-name">{selected.label}</span>
              <span className="bdr-config-derived">{selected.derived}</span>
            </div>

            <div className="bdr-config-body">
              <ConfigForm control={selected} />
            </div>
          </div>
        )}

        {/* Collapsed indicator — a flyout chevron to re-expand */}
        {controlsCollapsed && (
          <button className="bdr-expand-tab" data-tip="Expand controls pane">
            <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><Icons.ChevronRight size={12} /></span>
            <span className="bdr-expand-count">10 controls</span>
          </button>
        )}
      </div>

      <style>{BUILDER_STYLES}</style>
    </div>
  );
}

function CtrlIcon({ kind }) {
  const icons = {
    text:    <Icons.Edit size={11} />,
    slider:  <Icons.SplitV size={11} />,
    button:  <Icons.PlayCircle size={11} />,
    toggle:  <Icons.Power size={11} />,
    knob:    <Icons.Rotate size={11} />,
    stepper: <Icons.Hash size={11} />,
    select:  <Icons.Chevron size={11} />,
    console: <Icons.Terminal size={11} />,
    readout: <Icons.Battery size={11} />,
    gauge:   <Icons.Cpu size={11} />,
    led:     <Icons.Network size={11} />,
    status:  <Icons.PlayCircle size={11} />,
    section: <Icons.Folder size={11} />,
  };
  return icons[kind] || <Icons.Wand size={11} />;
}

// Per-control config forms — one per kind. Most reuse the same primitives.
function ConfigForm({ control }) {
  if (control.kind === "button")  return <ConfigButton control={control} />;
  if (control.kind === "console") return <ConfigConsole control={control} />;
  if (control.kind === "readout") return <ConfigReadout control={control} />;
  if (control.kind === "section") return <ConfigSection control={control} />;
  return <ConfigInput control={control} />; // text / slider / toggle / select / stepper / knob
}

// ── Reusable form bits ──────────────────────────────────────────────────────
function FormRow({ label, help, children }) {
  return (
    <>
      <div className="bdr-form-row">
        <label>{label}</label>
        <div className="bdr-form-input">{children}</div>
        {help && <div className="bdr-form-help">{help}</div>}
      </div>
    </>
  );
}

function FormDesc({ value = "Stops the app's currently running processes. Doesn't clear stored data.", inline = false, supportsInline = false }) {
  return (
    <>
      <FormRow label="Description" help="Shown as a tooltip on hover. Optional.">
        <textarea className="bdr-form-textarea" rows={2} defaultValue={value} />
      </FormRow>
      {supportsInline && (
        <FormRow label="" help="Renders the description directly under the control instead of only on hover.">
          <label className="bdr-checkbox">
            <input type="checkbox" defaultChecked={inline} />
            <span>Show description inline</span>
          </label>
        </FormRow>
      )}
    </>
  );
}

function Toggle({ on = false }) {
  return (
    <button className={"bdr-tg " + (on ? "on" : "")}>
      <span className="bdr-tg-dot" />
    </button>
  );
}

// Common-to-all input controls
function ConfigInput({ control }) {
  return (
    <div className="bdr-form">
      <FormRow label="Label" help={<>Derives the env var. <code>{varFromLabel(control.label)}</code></>}>
        <input defaultValue={control.label} />
      </FormRow>
      <FormDesc value="0–255. Writes to settings.system.screen_brightness." inline={control.kind === "slider"} supportsInline />
      <FormRow label="Default value" help="Initial value when the panel loads.">
        <input defaultValue="178" />
      </FormRow>
      {control.kind === "slider" && (
        <FormRow label="Range" help="Inclusive min/max and step size.">
          <input defaultValue="0" style={{ maxWidth: 80 }} />
          <span style={{ color: "var(--fg-3)" }}>to</span>
          <input defaultValue="255" style={{ maxWidth: 80 }} />
          <span style={{ color: "var(--fg-3)" }}>step</span>
          <input defaultValue="1" style={{ maxWidth: 70 }} />
        </FormRow>
      )}
      <FormRow label="Unit" help="Suffix shown next to the value. Optional.">
        <input defaultValue="" placeholder="e.g. °C, %, x" />
      </FormRow>
      <FormRow label="On change" help="Whether changing this value automatically refreshes any displays bound to it.">
        <div className="bdr-seg">
          <button className="active">Refresh bound displays</button>
          <button>Do nothing</button>
        </div>
      </FormRow>
    </div>
  );
}

function ConfigButton({ control }) {
  return (
    <div className="bdr-form">
      <FormRow label="Label" help={<>Drives the function name: <code>{fnFromLabel(control.label)}()</code></>}>
        <input defaultValue={control.label} />
      </FormRow>
      <FormDesc value="Stops the app's running processes. Doesn't clear stored data." />
      <FormRow label="Variant" help="">
        <div className="bdr-seg">
          <button className="active">Default</button>
          <button>Subtle</button>
          <button>Destructive</button>
        </div>
      </FormRow>
      <FormRow label="Confirm before running" help="Useful for destructive operations. Off by default.">
        <Toggle on={false} />
      </FormRow>
      <FormRow label="Bind output to" help="Where stdout/stderr from this function appear. Default: the panel's console.">
        <div className="bdr-form-select">
          <span>console (default)</span>
          <Icons.Chevron size={11} />
        </div>
      </FormRow>
      <FormRow label="Function preview" help="Linked from the script. Click to jump.">
        <pre className="bdr-fnpreview">{`force_stop() {
  am force-stop "$PACKAGE"
}`}</pre>
      </FormRow>
    </div>
  );
}

function ConfigConsole() {
  return (
    <div className="bdr-form">
      <FormRow label="Label" help="Shown in the console header.">
        <input defaultValue="Console" />
      </FormRow>
      <FormRow label="Scope" help="Display the most recent run, or scrollback of every run.">
        <div className="bdr-seg">
          <button className="active">Most recent run</button>
          <button>Scrollback</button>
        </div>
      </FormRow>
      <FormRow label="Copy button" help="Show a copy-to-clipboard button in the console header.">
        <Toggle on={true} />
      </FormRow>
      <FormRow label="Auto-scroll" help="Scroll to the bottom when new output arrives.">
        <Toggle on={true} />
      </FormRow>
    </div>
  );
}

function ConfigReadout({ control }) {
  return (
    <div className="bdr-form">
      <FormRow label="Label" help="Display name. Doesn't affect the function name.">
        <input defaultValue={control.label} />
      </FormRow>
      <FormDesc value="From dumpsys battery; divided by 10 to get °C." />
      <FormRow label="Bound to" help="Function whose output fills this readout.">
        <div className="bdr-form-select">
          <span>battery_temp()</span>
          <Icons.Chevron size={11} />
        </div>
      </FormRow>
      <FormRow label="Unit" help="">
        <input defaultValue="°C" style={{ maxWidth: 100 }} />
      </FormRow>
      <FormRow label="Auto-poll" help="Re-run the bound function on a fixed interval. Off by default.">
        <div className="bdr-form-input" style={{ gap: 12 }}>
          <Toggle on={true} />
          <span style={{ color: "var(--fg-3)", fontSize: "var(--t-xs)" }}>every</span>
          <input defaultValue="2" style={{ maxWidth: 60 }} />
          <span style={{ color: "var(--fg-3)", fontSize: "var(--t-xs)" }}>seconds</span>
        </div>
      </FormRow>
      <FormRow label="Refresh on input change" help="When any input the function reads ($PACKAGE, $BRIGHTNESS, …) changes, re-run eagerly.">
        <Toggle on={true} />
      </FormRow>
    </div>
  );
}

function ConfigSection({ control }) {
  return (
    <div className="bdr-form">
      <FormRow label="Heading" help="The section title shown in the panel.">
        <input defaultValue={control.label} />
      </FormRow>
      <FormRow label="Description" help="Optional context shown under the heading.">
        <textarea className="bdr-form-textarea" rows={2} defaultValue="Live device metrics, refreshed every 2 seconds." />
      </FormRow>
      <FormRow label="" help={<>A section is non-interactive. Controls below it visually belong to this group until the next section.</>}>
        <div className="bdr-form-note">
          <Icons.Folder size={11} /> Sections only affect display — they don't change scoping or the script env.
        </div>
      </FormRow>
    </div>
  );
}

// Minimal syntax highlighter — visual fidelity only.
function highlight(src) {
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lines = src.split("\n").map(line => {
    let out = escape(line);
    out = out.replace(/(^|\s)(#[^\n]*)/g, '$1<span class="hl-cmt">$2</span>');
    out = out.replace(/("[^"]*")/g, '<span class="hl-str">$1</span>');
    out = out.replace(/^([a-z_][a-z0-9_]*)(\(\))/gi, '<span class="hl-fn">$1</span><span class="hl-pun">$2</span>');
    out = out.replace(/\$\{?[A-Z_][A-Z0-9_]*\}?/g, m => `<span class="hl-var">${m}</span>`);
    out = out.replace(/\b(set|done|do|then|fi|if|else|elif|while|for|in|local|return)\b/g, '<span class="hl-kw">$1</span>');
    out = out.replace(/^(#!\/[^\n]*)/, '<span class="hl-shebang">$1</span>');
    return out;
  });
  return <span dangerouslySetInnerHTML={{ __html: lines.join("\n") }} />;
}

const BUILDER_STYLES = `
  .bdr-modal {
    display: flex; flex-direction: column;
    background: oklch(from var(--bg-1) l c h / 0.96);
    backdrop-filter: blur(24px);
    border: 1px solid var(--glass-line);
    border-radius: var(--r-lg);
    box-shadow: 0 24px 80px oklch(0 0 0 / 0.6);
    overflow: hidden;
  }
  .bdr-head {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--glass-line);
    background: oklch(from var(--bg-0) l c h / 0.5);
  }
  .bdr-head-icon {
    width: 28px; height: 28px;
    display: inline-flex; align-items: center; justify-content: center;
    background: oklch(from var(--accent) l c h / 0.14);
    border: 1px solid oklch(from var(--accent) l c h / 0.3);
    border-radius: 7px;
    color: var(--accent);
  }
  .bdr-head-titles { line-height: 1.2; }
  .bdr-head-title { font-size: var(--t-md); font-weight: 600; color: var(--fg-0); }
  .bdr-head-sub { font-size: var(--t-xs); color: var(--fg-3); margin-top: 1px; }
  .bdr-pillbtn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px;
    border-radius: 7px;
    font-size: var(--t-sm);
    font-weight: 500;
  }
  .bdr-pillbtn.ghost { background: transparent; color: var(--fg-1); }
  .bdr-pillbtn.ghost:hover { background: var(--bg-2); }
  .bdr-pillbtn.primary { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .bdr-close {
    width: 30px; height: 30px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 7px;
    color: var(--fg-3);
    margin-left: 4px;
  }
  .bdr-close:hover { background: var(--bg-2); color: var(--fg-0); }

  .bdr-body { display: grid; flex: 1; min-height: 0; position: relative; }
  .bdr-left, .bdr-right {
    display: flex; flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .bdr-left { border-right: 1px solid var(--glass-line); }

  /* Resizer — overlays the column boundary */
  .bdr-resizer {
    position: absolute;
    top: 0; bottom: 0;
    left: calc(var(--split, 60%));
    width: 8px;
    transform: translateX(-50%);
    cursor: col-resize;
    z-index: 5;
    display: flex; align-items: center; justify-content: center;
  }
  /* We don't actually compute the position dynamically — visually the
     handle sits centred on the column edge. Hide the absolute version
     and use a relative one that lives inside the grid. */
  .bdr-resizer { position: relative; left: auto; transform: none; width: 6px; margin-left: -3px; margin-right: -3px; flex-shrink: 0; }
  .bdr-resizer:hover .bdr-resizer-grip,
  .bdr-resizer:active .bdr-resizer-grip { opacity: 1; background: oklch(from var(--accent) l c h / 0.18); }
  .bdr-resizer-grip {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    width: 14px; height: 36px;
    border-radius: 4px;
    opacity: 0.4;
    transition: opacity 120ms, background 120ms;
  }
  .bdr-resizer-grip > span {
    width: 2px; height: 2px;
    border-radius: 50%;
    background: var(--fg-1);
  }

  /* Body needs to also include the resizer column */
  .bdr-body { grid-template-columns: var(--leftpct, 60%) 6px 1fr; }
  /* But we set grid-template-columns inline in JSX as "60% 40%" — to keep
     the resizer flowing inline, we just let it sit between the two columns
     via document order. So adjust: */
  .bdr-body { grid-template-columns: unset !important; display: flex !important; }
  .bdr-left { flex: 0 0 auto; }
  .bdr-right { flex: 1 1 auto; }

  .bdr-section-head {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    font-size: var(--t-xs);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--fg-3);
    border-bottom: 1px solid var(--glass-line);
    background: oklch(from var(--bg-0) l c h / 0.4);
    flex-shrink: 0;
  }
  .bdr-mini-hint {
    text-transform: none; letter-spacing: 0.04em;
    display: inline-flex; align-items: center; gap: 4px;
    color: var(--fg-3);
    font-size: var(--t-xs);
  }
  .bdr-mini-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 8px;
    border-radius: 5px;
    background: var(--bg-2);
    color: var(--fg-1);
    font-size: var(--t-xs);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
  }
  .bdr-mini-btn:hover { background: var(--bg-3); }
  .bdr-mini-btn.primary {
    background: oklch(from var(--accent) l c h / 0.18);
    color: var(--accent-fg);
  }
  .bdr-mini-btn.primary:hover { background: oklch(from var(--accent) l c h / 0.28); }

  /* Run-as-root toggle in the script section header */
  .bdr-root-toggle {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 3px 8px 3px 10px;
    margin-left: auto;
    border-radius: 999px;
    background: var(--bg-2);
    border: 1px solid var(--glass-line);
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0.02em;
  }
  .bdr-root-toggle.on {
    background: oklch(from var(--lvl-w-fg) l c h / 0.16);
    border-color: oklch(from var(--lvl-w-fg) l c h / 0.4);
  }
  .bdr-root-text { font-size: var(--t-xs); color: var(--fg-1); }
  .bdr-root-toggle.on .bdr-root-text { color: var(--lvl-w-fg); font-weight: 600; }
  .bdr-root-tg {
    width: 26px; height: 14px;
    border-radius: 999px;
    background: var(--bg-3);
    position: relative;
    transition: background 160ms;
  }
  .bdr-root-tg.on { background: var(--lvl-w-fg); }
  .bdr-root-tg-dot {
    position: absolute; top: 2px; left: 2px;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--fg-0);
    transition: transform 160ms var(--ease-spring);
  }
  .bdr-root-tg.on .bdr-root-tg-dot { transform: translateX(12px); background: oklch(0.99 0 0); }

  /* Editor */
  .bdr-editor {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: auto;
    background: oklch(from var(--bg-0) calc(l - 0.02) c h);
    font-family: var(--font-mono);
    font-size: var(--t-sm);
    line-height: 1.55;
  }
  .bdr-editor-gutter {
    flex-shrink: 0;
    text-align: right;
    padding: 12px 10px 12px 14px;
    color: var(--fg-3);
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
    user-select: none;
    border-right: 1px solid var(--glass-line);
  }
  .bdr-editor-text {
    flex: 1;
    margin: 0;
    padding: 12px 14px;
    color: var(--fg-0);
    white-space: pre;
    tab-size: 2;
    overflow: auto;
  }
  .hl-cmt { color: var(--fg-3); font-style: italic; }
  .hl-str { color: oklch(0.78 0.13 60); }
  .hl-fn { color: oklch(0.78 0.13 220); font-weight: 600; }
  .hl-var { color: oklch(0.82 0.13 150); }
  .hl-kw { color: oklch(0.78 0.13 300); }
  .hl-pun { color: var(--fg-3); }
  .hl-shebang { color: var(--fg-3); }

  .bdr-legend {
    padding: 10px 14px 12px;
    border-top: 1px solid var(--glass-line);
    background: oklch(from var(--bg-0) l c h / 0.6);
    flex-shrink: 0;
  }
  .bdr-legend-head {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--fg-3);
    margin-bottom: 6px;
  }
  .bdr-legend-count {
    background: var(--bg-3);
    color: var(--fg-1);
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
    letter-spacing: 0;
    margin-left: 4px;
  }
  .bdr-legend-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .bdr-chip {
    background: oklch(from var(--lvl-i-bg) l c h / 0.6);
    color: var(--lvl-i-fg);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: var(--t-xs);
    font-family: var(--font-mono);
    cursor: help;
  }
  .bdr-chip.fn {
    background: oklch(from var(--lvl-d-bg) l c h / 0.6);
    color: var(--lvl-d-fg);
  }

  /* Right pane */
  .bdr-ctrl-list {
    flex: 0 1 auto;
    max-height: 38%;
    overflow: auto;
    padding: 6px 8px;
    border-bottom: 1px solid var(--glass-line);
  }
  .bdr-ctrl-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    color: var(--fg-1);
    font-size: var(--t-sm);
    cursor: grab;
    border: 1px solid transparent;
  }
  .bdr-ctrl-row:hover { background: var(--bg-2); }
  .bdr-ctrl-row.selected {
    background: oklch(from var(--accent) l c h / 0.12);
    border-color: oklch(from var(--accent) l c h / 0.3);
    color: var(--fg-0);
  }
  .bdr-ctrl-row.is-section {
    background: oklch(from var(--bg-0) l c h / 0.6);
    margin-top: 6px;
  }
  .bdr-ctrl-row.is-section .bdr-ctrl-label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: var(--t-xs);
    font-weight: 600;
    color: var(--fg-2);
  }
  .bdr-ctrl-drag { color: var(--fg-3); opacity: 0.5; display: inline-flex; }
  .bdr-ctrl-kind {
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 5px;
    color: var(--accent-fg);
    background: oklch(from var(--accent) l c h / 0.16);
    flex-shrink: 0;
  }
  .bdr-ctrl-kind.kind-console,
  .bdr-ctrl-kind.kind-readout,
  .bdr-ctrl-kind.kind-gauge,
  .bdr-ctrl-kind.kind-led,
  .bdr-ctrl-kind.kind-status {
    color: oklch(from var(--lvl-d-fg) l c h);
    background: oklch(from var(--lvl-d-bg) l c h / 0.55);
  }
  .bdr-ctrl-kind.kind-section {
    color: var(--fg-2);
    background: var(--bg-2);
  }
  .bdr-ctrl-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bdr-ctrl-derived { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--fg-3); }
  .bdr-ctrl-del {
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 4px;
    color: var(--fg-3);
    opacity: 0;
    transition: opacity 120ms;
  }
  .bdr-ctrl-row:hover .bdr-ctrl-del { opacity: 1; }
  .bdr-ctrl-del:hover { background: oklch(from var(--lvl-e-fg) l c h / 0.18); color: var(--lvl-e-fg); }

  .bdr-config-head {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    font-size: var(--t-sm);
    color: var(--fg-3);
    background: oklch(from var(--bg-0) l c h / 0.3);
    border-bottom: 1px solid var(--glass-line);
  }
  .bdr-config-name { color: var(--fg-0); font-weight: 600; }
  .bdr-config-derived { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--accent-fg); }

  .bdr-config-body { flex: 1; min-height: 0; overflow: auto; padding: 16px 18px; }
  .bdr-form { display: flex; flex-direction: column; gap: 14px; max-width: 580px; }
  .bdr-form-row { display: grid; grid-template-columns: 130px 1fr; gap: 4px 16px; align-items: start; }
  .bdr-form-row label { font-size: var(--t-sm); color: var(--fg-1); padding-top: 6px; }
  .bdr-form-input { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .bdr-form-input input,
  .bdr-form-textarea {
    background: var(--bg-0);
    border: 1px solid var(--glass-line);
    border-radius: 6px;
    padding: 0 10px;
    height: 30px;
    color: var(--fg-0);
    font-family: var(--font-mono);
    font-size: var(--t-sm);
    min-width: 160px;
    flex: 1;
  }
  .bdr-form-textarea { padding: 7px 10px; min-height: 50px; height: auto; resize: vertical; font-family: var(--font-sans, inherit); line-height: 1.5; }
  .bdr-form-input input:focus,
  .bdr-form-textarea:focus { border-color: oklch(from var(--accent) l c h / 0.55); outline: 0; }
  .bdr-form-help { grid-column: 2; font-size: var(--t-xs); color: var(--fg-3); line-height: 1.5; }
  .bdr-form-help code { color: var(--fg-1); background: var(--bg-2); padding: 0 4px; border-radius: 3px; font-size: 10.5px; font-family: var(--font-mono); }
  .bdr-form-select {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-0); border: 1px solid var(--glass-line);
    border-radius: 6px; padding: 0 10px; height: 30px;
    color: var(--fg-0); font-size: var(--t-sm);
    min-width: 220px;
  }
  .bdr-form-note {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 10px;
    background: oklch(from var(--accent) l c h / 0.08);
    color: var(--fg-2);
    border-radius: 6px;
    font-size: var(--t-xs);
  }
  .bdr-seg { display: inline-flex; padding: 2px; background: var(--bg-2); border-radius: 6px; gap: 2px; }
  .bdr-seg button { padding: 5px 12px; border-radius: 4px; font-size: var(--t-sm); color: var(--fg-2); white-space: nowrap; }
  .bdr-seg button.active { background: var(--bg-0); color: var(--fg-0); box-shadow: var(--shadow-1); }
  .bdr-checkbox {
    display: inline-flex; align-items: center; gap: 7px;
    color: var(--fg-1);
    font-size: var(--t-sm);
    cursor: pointer;
  }
  .bdr-checkbox input { width: 14px; height: 14px; accent-color: var(--accent); }
  .bdr-tg {
    width: 32px; height: 18px;
    border-radius: 999px;
    background: var(--bg-3);
    position: relative;
    transition: background 160ms;
  }
  .bdr-tg.on { background: var(--accent); }
  .bdr-tg-dot {
    position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--fg-0);
    transition: transform 160ms var(--ease-spring);
  }
  .bdr-tg.on .bdr-tg-dot { transform: translateX(14px); background: var(--on-accent); }
  .bdr-fnpreview {
    margin: 0;
    padding: 10px 12px;
    background: oklch(from var(--bg-0) calc(l - 0.02) c h);
    border: 1px solid var(--glass-line);
    border-radius: 6px;
    color: var(--fg-1);
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    line-height: 1.55;
    flex: 1;
    min-width: 200px;
  }

  /* Collapsed-pane re-expand tab */
  .bdr-expand-tab {
    position: absolute;
    top: 50%; right: 0;
    transform: translateY(-50%);
    background: oklch(from var(--accent) l c h / 0.18);
    color: var(--accent-fg);
    border-left: 1px solid oklch(from var(--accent) l c h / 0.3);
    border-top: 1px solid oklch(from var(--accent) l c h / 0.3);
    border-bottom: 1px solid oklch(from var(--accent) l c h / 0.3);
    border-top-left-radius: 8px;
    border-bottom-left-radius: 8px;
    padding: 14px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .bdr-expand-tab:hover { background: oklch(from var(--accent) l c h / 0.28); }
  .bdr-expand-count {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-family: var(--font-mono);
  }
`;

Object.assign(window, { BuilderModal, ConfigForm });
