// Scripting widget — design canvas composition.
// Single deliverable: wireframes → hi-fi → catalog → theming → iconography.

(function injectStyles() {
  if (document.getElementById("sc-styles")) return;
  const s = document.createElement("style");
  s.id = "sc-styles";
  s.textContent = SC_STYLES;
  document.head.appendChild(s);
})();

// ── Section A — wireframes ──────────────────────────────────────────────────
function WireframeBody() {
  return (
    <div className="wire">
      <div className="wire-head"><span>WIDGET BODY · populated</span></div>
      <div className="wire-block cap">DISPLAYS · full-width band</div>
      <div className="wire-block solid" style={{ minHeight: 38 }}>readout · readout · gauge · status pill</div>
      <div className="wire-row">
        <div className="wire-block solid">slider</div>
        <div className="wire-block solid">knob</div>
      </div>
      <div className="wire-row">
        <div className="wire-block solid">text field</div>
        <div className="wire-block solid">toggle</div>
      </div>
      <div className="wire-row">
        <div className="wire-block">btn</div>
        <div className="wire-block">btn</div>
        <div className="wire-block">btn</div>
      </div>
      <div className="wire-block cap" style={{ flex: 1, minHeight: 60 }}>
        CONSOLE · most recent run
        <div className="wire-anno">stdout / stderr · exit code chip · scrolls</div>
      </div>
    </div>
  );
}

function WireframeBuilder() {
  return (
    <div className="wire">
      <div className="wire-head"><span>BUILDER MODAL</span></div>
      <div className="wire-block cap">header · &quot;Scripting · settings&quot; · save/discard</div>
      <div className="wire-row" style={{ flex: 1, minHeight: 0 }}>
        <div className="wire-stack" style={{ flex: "1 1 45%" }}>
          <div className="wire-block cap">script editor · plain textarea</div>
          <div className="wire-block solid" style={{ flex: 1 }}>
            set_brightness · force_stop · info · battery_temp
          </div>
          <div className="wire-block">vars + functions legend</div>
        </div>
        <div className="wire-stack" style={{ flex: "1 1 55%" }}>
          <div className="wire-block cap">controls list · drag/reorder</div>
          <div className="wire-block solid">
            text &quot;Package&quot;<br/>
            button &quot;Force stop&quot; ← selected<br/>
            console &quot;Output&quot;
          </div>
          <div className="wire-block cap">per-control config</div>
          <div className="wire-block solid" style={{ flex: 1 }}>label · role · variant · confirm · bind</div>
        </div>
      </div>
    </div>
  );
}

// ── Section C — control catalog cells ───────────────────────────────────────
function Cell({ name, children }) {
  return (
    <div className="cat-cell">
      <span className="cat-cell-label">{name}</span>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function CatalogGrid() {
  return (
    <div className="cat-grid">
      <div className="cat-title">
        <span className="cat-title-main">Control catalog · per-control states</span>
        <span className="cat-title-sub">columns: idle · active/value · busy · error</span>
      </div>

      {/* BUTTON row */}
      <Cell name="button · idle"><ScButton label="Force stop" /></Cell>
      <Cell name="button · active"><ScButton label="Info" state="active" /></Cell>
      <Cell name="button · busy"><ScButton label="Force stop" state="busy" /></Cell>
      <Cell name="button · error"><ScButton label="Force stop" state="error" /></Cell>

      {/* TOGGLE row */}
      <Cell name="toggle · off"><ScToggle label="Verbose" value={false} /></Cell>
      <Cell name="toggle · on"><ScToggle label="Verbose" value={true} /></Cell>
      <Cell name="toggle · busy"><ScToggle label="Verbose" value={true} state="busy" /></Cell>
      <Cell name="toggle · error"><ScToggle label="Verbose" value={false} state="error" /></Cell>

      {/* SLIDER row */}
      <Cell name="slider · min"><ScSlider label="Brightness" value={0} /></Cell>
      <Cell name="slider · mid"><ScSlider label="Brightness" value={178} /></Cell>
      <Cell name="slider · max"><ScSlider label="Brightness" value={255} /></Cell>
      <Cell name="slider · error"><ScSlider label="Brightness" value={120} state="error" /></Cell>

      {/* TEXT + SELECT + STEPPER + KNOB row */}
      <Cell name="text"><ScText label="Package" /></Cell>
      <Cell name="select"><ScSelect label="Doze mode" /></Cell>
      <Cell name="stepper"><ScStepper label="Anim scale" value={1} unit="x" /></Cell>
      <Cell name="knob"><ScKnob label="Volume" value={60} /></Cell>

      {/* DISPLAYS section divider */}
      <div className="cat-title" style={{ marginTop: 12 }}>
        <span className="cat-title-main">Displays · function-bound</span>
        <span className="cat-title-sub">readout · status · gauge · LED · console</span>
      </div>

      <Cell name="readout · ok"><ScReadout /></Cell>
      <Cell name="readout · warn"><ScReadout label="Battery temp" value="41.8" unit="°C" state="warn" /></Cell>
      <Cell name="readout · err"><ScReadout label="Battery temp" value="—" unit="" state="err" /></Cell>
      <Cell name="readout · large"><ScReadout label="Frame janky" value="2.06" unit="%" /></Cell>

      <Cell name="status · ok"><ScStatus label="Network" state="ok" text="WiFi · 5G" /></Cell>
      <Cell name="status · warn"><ScStatus label="Thermal" state="warn" text="WARNING" /></Cell>
      <Cell name="status · err"><ScStatus label="Daemon" state="err" text="not running" /></Cell>
      <Cell name="status · busy"><ScStatus label="Network" state="busy" text="" /></Cell>

      <Cell name="gauge · low"><ScGauge label="CPU" value={12} /></Cell>
      <Cell name="gauge · mid"><ScGauge label="CPU" value={38} /></Cell>
      <Cell name="gauge · hi"><ScGauge label="CPU" value={92} /></Cell>
      <Cell name="gauge · err"><ScGauge label="CPU" value={0} state="err" /></Cell>

      <Cell name="LED · green"><ScLED label="Network" state="on" color="green" /></Cell>
      <Cell name="LED · amber"><ScLED label="Thermal" state="warn" color="amber" /></Cell>
      <Cell name="LED · red"><ScLED label="Wakelock" state="held" color="red" /></Cell>
      <Cell name="LED · off"><ScLED label="Doze" state="off" color="off" /></Cell>

      {/* Console — spans 4 cols */}
      <div style={{ gridColumn: "1 / -1" }}>
        <div className="cat-cell" style={{ minHeight: 220 }}>
          <span className="cat-cell-label">console · ok / busy / error / empty</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <ScConsole fn="info" />
            <ScConsole fn="force_stop" state="busy" />
            <ScConsole fn="force_stop" exit={1} state="error" />
            <ScConsole fn="info" empty />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section E — iconography preview ─────────────────────────────────────────
function IconStrip() {
  const items = [
    { name: "wand", glyph: <Icons.Wand size={18} />, tag: "topbar" },
    { name: "play-circle", glyph: <Icons.PlayCircle size={18} />, tag: "action" },
    { name: "terminal", glyph: <Icons.Terminal size={18} />, tag: "console" },
    { name: "rotate", glyph: <Icons.Rotate size={18} />, tag: "new", neu: true },
    { name: "split-v", glyph: <Icons.SplitV size={18} />, tag: "new", neu: true },
    { name: "power", glyph: <Icons.Power size={18} />, tag: "new", neu: true },
    { name: "hash", glyph: <Icons.Hash size={18} />, tag: "new", neu: true },
  ];
  return (
    <div className="icon-strip">
      {items.map((i) => (
        <div className="icon-tile" key={i.name}>
          <span className="icon-tile-glyph">{i.glyph}</span>
          <span className="icon-tile-name">{i.name}</span>
          <span className={"icon-tile-tag" + (i.neu ? " new" : "")}>{i.tag}</span>
        </div>
      ))}
    </div>
  );
}

// ── Theming (light vs dark glass) — small showcase ─────────────────────────
function ThemedTile({ theme = "dark", w, h }) {
  // Tile renders within an isolated [data-theme] subtree so design tokens flip.
  return (
    <div data-theme={theme} style={{ width: "100%", height: "100%" }}>
      <div className={"tile-stage" + (theme === "light" ? " light" : "")}>
        <PopulatedSmall w="100%" h="100%" />
      </div>
    </div>
  );
}

// ── Master canvas ───────────────────────────────────────────────────────────
function ScriptingDesign() {
  return (
    <DesignCanvas>

      <DCSection id="intro" title="Scripting · widget" subtitle="A user-built control panel that wraps an mksh script. One panel = a fresh script env; controls are inputs (export $VARS) or actions (run functions); displays render function output.">
        <DCArtboard id="intro-note" label="Concept" width={760} height={560}>
          <div className="spec-note">
            <h2>What is the Scripting widget?</h2>
            <p className="lede">
              A <span className="accent">Tasker-style</span> panel where the user writes one shell script
              and binds UI controls to its variables and functions. Every control either feeds the script
              (input → <code>$VAR</code>) or shows the result of running it (display → <code>fn()</code>).
            </p>

            <h3>Rules</h3>
            <ul>
              <li>One panel ↔ one script ↔ one persistent shell environment.</li>
              <li>Multiple Scripting widgets each have their own environment.</li>
              <li>The widget body is a free-form panel; the cog opens the <span className="accent">builder modal</span>.</li>
              <li>Every control's name auto-derives a slot in the env: <code>Brightness</code> → <code>$BRIGHTNESS</code>; <code>Force stop</code> → <code>force_stop()</code>.</li>
            </ul>

            <h3>Two roles a control can play</h3>
            <div className="twocol">
              <div>
                <strong>Inputs</strong> carry a value.<br/>
                text · slider · knob · toggle · select · stepper · button-as-counter.<br/>
                <em>The script reads them as env vars.</em>
              </div>
              <div>
                <strong>Displays</strong> show function output.<br/>
                console · readout · status · gauge · LED.<br/>
                <em>Bound to <code>fn()</code>, polled or run on demand.</em>
              </div>
            </div>

            <h3>Layout choice for the builder</h3>
            <p>
              <strong>Two-pane horizontal</strong> — script on the left, controls on the right.
              Users wire controls to function names; keeping the script visible while editing controls
              eliminates the context switch a tabbed layout would create.
            </p>
          </div>
        </DCArtboard>

        <DCArtboard id="intro-anatomy" label="Body anatomy" width={520} height={560}>
          <div className="spec-note">
            <h2>Body anatomy</h2>
            <p>Two bands: displays + inputs. Both reflow on a CSS grid so the same panel works in any tile size.</p>
            <h3>Top band — displays</h3>
            <p>Readouts, status pills, gauges, LEDs. Always full-width-grid, since these are the &quot;at a glance&quot; signals.</p>
            <h3>Middle band — inputs</h3>
            <p>Auto-flow grid (min 170px column). Mixes value-bearing controls in their natural sizes.</p>
            <h3>Bottom band — action buttons + console</h3>
            <p>Action buttons cluster as a chip rail; the console takes the remaining vertical space and shows the most recent run with stdout, stderr, and an exit-code chip.</p>
            <h3>Tile chrome</h3>
            <p>Same drag-handle, settings cog, eye-toggle, maximize, close as other widgets — no new chrome.</p>
          </div>
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Wireframes ───────────────────── */}
      <DCSection id="wires" title="Wireframes" subtitle="Low-fi structure before pixels. Two artboards: the widget body and the builder modal.">
        <DCArtboard id="wire-body" label="Body wireframe" width={520} height={560}>
          <WireframeBody />
        </DCArtboard>
        <DCArtboard id="wire-builder" label="Builder wireframe" width={760} height={560}>
          <WireframeBuilder />
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Runtime states ───────────────────── */}
      <DCSection id="states" title="Runtime states · widget body" subtitle="Same component, surfaced in the dashboard at different sizes and under different conditions.">
        <DCArtboard id="state-empty" label="Empty (no controls yet)" width={420} height={480}>
          <div className="tile-stage"><EmptyPanel w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-small" label="Populated · small tile" width={420} height={480}>
          <div className="tile-stage"><PopulatedSmall w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-large" label="Populated · large tile (sections + inline descriptions)" width={780} height={820}>
          <div className="tile-stage"><PopulatedLarge w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-busy" label="Mid-run · busy" width={420} height={480}>
          <div className="tile-stage"><BusyPanel w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-error" label="Last run errored (exit 1)" width={420} height={480}>
          <div className="tile-stage"><ErrorPanel w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-script-error" label="Script syntax error · header pill" width={420} height={480}>
          <div className="tile-stage"><ScriptErrorPanel w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-hidden" label="Bars hidden (no console)" width={420} height={480}>
          <div className="tile-stage"><BarsHiddenPanel w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="state-tiny" label="Tiny tile (4×3 cells)" width={260} height={280}>
          <div className="tile-stage" style={{ padding: 10 }}><TinyPanel w="100%" h="100%" /></div>
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Sections deep-dive ───────────────────── */}
      <DCSection id="sections" title="Sections — grouping pattern" subtitle="A non-interactive control type. Title + optional description. Visual only, flat (no nesting). Use it to chunk a long panel into named groups.">
        <DCArtboard id="sections-demo" label="App debugger · 3 sections with descriptions" width={460} height={720}>
          <div className="tile-stage"><SectionsPanel w="100%" h="100%" /></div>
        </DCArtboard>

        <DCArtboard id="sections-anatomy" label="Anatomy" width={460} height={720}>
          <div className="spec-note">
            <h2>Section anatomy</h2>
            <p>A left accent-coloured bar pins the section to its content visually. The title is uppercase/tracked to differentiate it from a control label. An optional one-line description sits underneath; if you leave it blank, the section is a tighter visual divider.</p>

            <h3>What it does</h3>
            <ul>
              <li><strong>Visually groups</strong> the controls between it and the next section.</li>
              <li><strong>Counts</strong> the controls it contains (the small pill next to the title).</li>
              <li><strong>Folds</strong> when <em>bars hidden</em> is on, since it's chrome — controls keep rendering, the headings disappear.</li>
            </ul>

            <h3>What it doesn't do</h3>
            <ul>
              <li>Doesn't scope the script env — everything still shares one shell.</li>
              <li>Doesn't nest. Flat sections only.</li>
              <li>Doesn't collapse/expand at runtime — a panel is a panel, not an accordion.</li>
            </ul>

            <h3>Builder</h3>
            <p>Add via the same <code>+ Add</code> menu as any other control. Drag-reorder in the list to move it earlier or later; controls below it visually belong to it until the next section.</p>
          </div>
        </DCArtboard>
      </DCSection>
      <DCSection id="builder" title="Builder modal" subtitle="Two-pane horizontal. Default 60/40 split; a draggable handle adjusts width; a chevron collapses the controls pane so the editor gets the full width. Run-as-root toggle lives in the script chrome.">
        <DCArtboard id="builder-main" label="Default · 60/40 split · button config" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} selectedKind="button" paneSplit={60} />
          </div>
        </DCArtboard>

        <DCArtboard id="builder-wide" label="Handle dragged to 75/25 · more room for code" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} selectedKind="slider" paneSplit={75} />
          </div>
        </DCArtboard>

        <DCArtboard id="builder-collapsed" label="Controls collapsed · full-width editor · run-as-root on" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} controlsCollapsed runAsRoot />
          </div>
        </DCArtboard>

        <DCArtboard id="builder-readout" label="Per-control config: bound display (auto-poll + refresh-on-change)" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} selectedKind="readout" />
          </div>
        </DCArtboard>

        <DCArtboard id="builder-input" label="Per-control config: input control (description + inline checkbox)" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} selectedKind="slider" />
          </div>
        </DCArtboard>

        <DCArtboard id="builder-section" label="Per-control config: Section heading + description" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} selectedKind="section" />
          </div>
        </DCArtboard>

        <DCArtboard id="builder-console" label="Per-control config: Console (scope + copy button)" width={1180} height={820}>
          <div className="builder-bg">
            <BuilderModal w={1100} h={760} selectedKind="console" />
          </div>
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Control catalog ───────────────────── */}
      <DCSection id="catalog" title="Control catalog" subtitle="Every control and every state in one place. Tokens come from the existing WebLogcat design system — no new colors.">
        <DCArtboard id="cat-grid" label="All controls · all states" width={1180} height={1320}>
          <CatalogGrid />
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Theming ───────────────────── */}
      <DCSection id="theming" title="Theme support" subtitle="The widget respects the existing data-theme + data-accent attributes — no new tokens.">
        <DCArtboard id="theme-dark" label="Dark (default)" width={420} height={480}>
          <ThemedTile theme="dark" />
        </DCArtboard>
        <DCArtboard id="theme-light" label="Light" width={420} height={480}>
          <ThemedTile theme="light" />
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Iconography ───────────────────── */}
      <DCSection id="icons" title="Iconography" subtitle="Existing icon set covers most controls. Five new glyphs needed — drawn in the existing 24px stroked style.">
        <DCArtboard id="icon-strip" label="Icon needs" width={760} height={300}>
          <IconStrip />
        </DCArtboard>

        <DCArtboard id="icon-spec" label="Spec sheet" width={420} height={300}>
          <div className="spec-note">
            <h2>Icon spec</h2>
            <p>Match <code>icons.jsx</code>: 24px viewBox, currentColor, 1.6 stroke.</p>
            <ul>
              <li><code>Rotate</code> — knob control (curved arrow)</li>
              <li><code>SplitV</code> — slider control (horiz rail + thumb)</li>
              <li><code>Power</code> — toggle control</li>
              <li><code>Hash</code> — number stepper</li>
              <li><code>Wand</code> — widget-type glyph in topbar palette</li>
            </ul>
            <p>Topbar widget palette gets a &quot;Scripting&quot; entry using the wand glyph. No new color tokens.</p>
          </div>
        </DCArtboard>
      </DCSection>

      {/* ───────────────────── Decision notes ───────────────────── */}
      <DCSection id="open" title="Decisions & resolved questions" subtitle="Round-3 decisions reflecting your latest feedback.">
        <DCArtboard id="decisions" label="Resolved" width={520} height={640}>
          <div className="spec-note">
            <h2>Resolved this round</h2>
            <ul>
              <li><strong>Run-as-root scope:</strong> per-panel toggle. Lives in the script section header of the builder.</li>
              <li><strong>Section nesting:</strong> flat only. No nested sub-sections.</li>
              <li><strong>Info dot visibility:</strong> always visible next to the label when a description exists — <em>except</em> when the description is shown inline (then the dot is hidden because the description is already on screen).</li>
              <li><strong>Section example:</strong> added a dedicated &quot;App debugger&quot; mock that uses three sections (Target / Lifecycle / Destructive) with descriptions, so the pattern is easy to see in isolation.</li>
            </ul>

            <h3>Previously resolved</h3>
            <ul>
              <li>Polling — off by default, per-display toggle + interval.</li>
              <li>Confirm-before-run — manual opt-in (no name heuristics).</li>
              <li>Console scope — last run only, with copy button.</li>
              <li>Stale data — refresh eagerly on input change; faint spinner during in-flight gap.</li>
              <li>Syntax errors — surfaced in builder <em>and</em> as a header pill.</li>
            </ul>
          </div>
        </DCArtboard>

        <DCArtboard id="answers" label="Spec summary" width={520} height={640}>
          <div className="spec-note">
            <h2>What we have</h2>
            <ul>
              <li>One widget body, three bands (displays → inputs → actions + console), all reflowing.</li>
              <li>One builder modal (60/40, draggable, collapsible, with run-as-root).</li>
              <li>Eleven control types in the catalog (six inputs, five displays) + sections as a non-interactive grouping type.</li>
              <li>Five new icon glyphs needed; everything else uses the existing icon set.</li>
              <li>Zero new color tokens — fully derived from existing tokens via <code>oklch(from …)</code>.</li>
            </ul>
            <h3>Recommended next steps</h3>
            <ul>
              <li>Lock spec & start backend: shell evaluator, per-widget env persistence, polling worker.</li>
              <li>Implement the builder modal first; the runtime panel is a thin renderer over the resulting control list.</li>
              <li>Defer: secrets/sensitive inputs handling (e.g. should a text input ever be redacted in the console?) — flag for a future round if relevant.</li>
            </ul>
          </div>
        </DCArtboard>
      </DCSection>

    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ScriptingDesign />);
