# Handoff: WebLogcat — Scripting Widget

## Overview

The **Scripting widget** is a new addition to the WebLogcat dashboard: a Tasker-style, user-built control panel that wraps a single shell script. Each panel owns one persistent shell environment. The user composes a panel from a small set of UI controls — every control either feeds the script (an **input** that exports its value as an env var) or shows the result of running it (a **display** that's bound to a shell function). Inputs include text, slider, knob, toggle, select, stepper, and action button. Displays include console, value readout, status pill, gauge, and LED. **Sections** group controls into named chunks.

The widget is configured through a **builder modal** opened from the tile's cog. Two-pane: shell script on the left (with a "Run as root" toggle and a legend of available variables/functions), controls list + per-control config form on the right. The split is draggable; the controls pane can be collapsed to give the editor the full width.

Multiple Scripting widgets can live on the dashboard at once — each with its own independent script and shell env. The intent is to let users assemble panels for common debugging workflows ("Package toolbox", "Performance lab", "App debugger") without writing a real app.

## About the Design Files

The files under `source/` are **design references created in HTML/CSS/JSX** — a high-fidelity prototype showing intended look and behavior, **not production code to copy directly**. There is no real shell execution; the script editor, controls, and console outputs are all simulated.

The task is to **recreate this design in the WebLogcat target codebase** (see [previous handoff](../design_handoff_weblogcat/README.md) for stack context — Vite + React + TypeScript + WebUSB/ADB). The Scripting widget plugs into the dashboard the same way the existing Logcat, Shell, Dumpsys, Files, and Mirror widgets do.

## Fidelity

**High-fidelity.** Final colors, typography (JetBrains Mono throughout), spacing, layout, animation easing, and state transitions are all production-intent. Recreate pixel-perfectly using the existing token system in `styles.css`. **No new color tokens were introduced** — everything derives from the existing palette via `oklch(from var(--token) …)`.

---

## Mental model

```
┌──────────────────────────────────────┐
│ One Scripting widget ───────────     │
│                                      │
│   ┌────────────────┐                 │
│   │  shell script  │  ←─ user-edited │
│   │  (mksh, posix) │      via cog    │
│   └────────────────┘                 │
│           │                          │
│   one persistent env, one widget     │
│           │                          │
│   ┌───────┴──────────────────────┐   │
│   │ Inputs  → export as $VARS    │   │
│   │ Actions → run function fn()  │   │
│   │ Displays → bound to fn()     │   │
│   └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘
```

Rules:
- **One panel ↔ one script ↔ one persistent shell environment.** State within the env (variables, cwd, exported function definitions) survives between runs.
- **Multiple Scripting widgets** each have their own env — they don't share state.
- **Every control's label auto-derives its slot in the env**:
  - Input control labelled `Brightness` exports as `$BRIGHTNESS`
  - Action button labelled `Force stop` calls `force_stop()` when pressed
  - Bound display labelled `Battery temperature` calls `battery_temp()` on poll/refresh
- Derivation: uppercase, snake_case, strip non-alphanumeric; functions are lowercased. This is **deterministic** — no user-editable second "variable name" field, since that would just be a confusing parallel naming system.

---

## Widget body (runtime)

The widget body is a free-form panel. Layout structure (top → bottom):

1. **Section header(s)** (optional) — group controls into named chunks; visual only.
2. **Displays band(s)** — readouts, gauges, status pills, LEDs. Always full-width on the panel's responsive grid.
3. **Inputs band(s)** — text/select/stepper/slider/knob/toggle, auto-flow grid (`repeat(auto-fit, minmax(170px, 1fr))`).
4. **Action button rail** — chip rail of action buttons.
5. **Console** (optional but on by default) — most-recent run, stdout + stderr + exit code, copy-to-clipboard button. Fills remaining vertical space.

Authors mix and match these in any order. See `PopulatedLarge` (Performance lab) and `SectionsPanel` (App debugger) in `scripting-panel.jsx` for two reference panels.

### Tile chrome

Same chrome as every other widget (per the WebLogcat v2 handoff): drag-handle, settings cog, eye toggle, maximize, close. Header height **34px** (same as other widgets), with one addition:

- **Script-error pill** — when the script fails to parse, render an amber-red pill in the header titled "script error". Click opens the builder modal. Pill uses `var(--lvl-e-bg)` / `var(--lvl-e-fg)`.

### Bars-hidden behavior

The dashboard's existing eye-toggle convention adds `.bars-hidden` to the tile root. For the Scripting widget, this hides:
- The console block (`.sc-console`)
- All section headings (`.sc-section`)

…leaving a clean controls-only view, suitable for a read-only dashboard glance.

---

## Controls

All controls live in `scripting-controls.jsx`. Each has a state machine: `idle` → `busy` → (`ok` | `error`). Visual states are demoed in the design canvas's "Control catalog" section.

### Inputs (carry a value, exported as `$VAR`)

| Control | Visual | Notes |
|---|---|---|
| **Text field** (`ScText`) | Material-outlined: 38px box with label floating on the top border | Monospace input |
| **Slider** (`ScSlider`) | Header row (label + value), optional inline description (below header, above track), 4px track + 14px thumb, min/max in tabular-nums | Step configurable |
| **Knob** (`ScKnob`) | SVG rotary, 270° sweep, –135° → +135° | Used for things that feel "dial-y" (volume) |
| **Toggle** (`ScToggle`) | Outlined surface (label left, 32×18 switch right) | Optional inline description |
| **Select** (`ScSelect`) | Material-outlined, chevron right, native `<select>` overlay | |
| **Stepper** (`ScStepper`) | Material-outlined, [− │ value │ +] | Numeric with min/max/step |
| **Action button** (`ScButton`) | 30px pill with play icon, optional lock icon if "confirm before running" is on, exit-code chip on error | Runs a function, no value |

### Displays (bound to a function, show its output)

| Control | Visual |
|---|---|
| **Console** (`ScConsole`) | Terminal-style with command line in accent, stdout in fg-1, stderr in error color. Header has small terminal glyph, "console" label, exit code chip (ok / err / busy), copy-to-clipboard button |
| **Readout** (`ScReadout`) | Big 22px tabular-nums value + unit + uppercase label below. States: ok / warn / err / stale (dimmed + spinner during refresh) |
| **Status pill** (`ScStatus`) | Dot + uppercase label + value text. States: ok / warn / err / busy |
| **Gauge** (`ScGauge`) | SVG semi-circular arc, 100×70, value at center, min/max at ends. Color shifts to warn at >85% |
| **LED** (`ScLED`) | 10px glowing dot + label + uppercase state. Colors: green / amber / red / blue / off |

### Non-interactive

| Control | Visual |
|---|---|
| **Section** (`ScSection`) | Heading (md, fg-0, weight 600) + optional description (xs, fg-3). Visual only; doesn't scope the env. **Flat — no nesting.** |

### Description and tooltips

Every control accepts an optional `description` prop. When set:
- An info-dot (small `Hash` icon in a circle) appears next to the label.
- Hovering the dot reveals a CSS tooltip (driven by `[data-tip]` attribute).

For these inputs — **toggle, slider, text, select, stepper** — the description can additionally be shown inline (rendered as `.sc-desc-inline` below or beside the label). When inline is on, the info-dot is hidden to avoid duplication.

### Floating-label trick

Text / Select / Stepper use a Material-style outlined approach: the label is `position: absolute; top: 1px; left: 10px; padding: 0 6px;` with an **opaque background** (`var(--sc-label-bg, oklch(from var(--bg-1) l c h))`) that masks the input's top border behind it. The `.sw-body` panel sets `--sc-label-bg` to an opaque surface color so the cut-effect works against the panel's translucent glass background. The catalog cells in the design canvas override it to `var(--bg-0)` for the same reason.

---

## Builder modal

Defined in `scripting-builder.jsx`. Opens when the user clicks the tile's cog.

### Layout

Two-pane horizontal:

```
┌─ Header ───────────────────────────────────────────────────────┐
│ ⌬ Scripting · settings              [Discard] [Save panel] [×] │
├─────────────────────────────────────┬──────────────────────────┤
│ SHELL SCRIPT     mksh  [Run as root]│ CONTROLS · 10  [‹] [+ Add]│
│ ┌──────┬─────────────────────────┐  │ ┌──────────────────────┐ │
│ │ 1│#!/system/bin/sh             │  │ │ … Inputs             │ │
│ │ 2│force_stop() {               │  │ │ Aa Package    $PACK… │ │
│ │ 3│  am force-stop "$PACKAGE"   │  │ │ ── Brightness $BRIG… │ │
│ │ 4│}                            │  │ │ ⊙  Verbose    $VERB… │ │
│ │ 5│…                            │  │ │ … Actions            │ │
│ │  │                             │  │ │ ▶ Force stop force_… │ │
│ │  │                             │  │ │ ▶ Clear data clear_… │ │
│ └──────┴─────────────────────────┘  │ └──────────────────────┘ │
│ # Available variables  3            │ Edit: ▶ Force stop       │
│ $PACKAGE $BRIGHTNESS $VERBOSE       │ ┌──────────────────────┐ │
│ ▶ Functions  5                      │ │ Label   [Force stop] │ │
│ set_brightness  force_stop  …       │ │ Desc    [textarea]   │ │
│                                     │ │ Variant [Default …]  │ │
│                                     │ │ Confirm [off]        │ │
│                                     │ │ Bind    [console v]  │ │
│                                     │ └──────────────────────┘ │
└─────────────────────────────────────┴──────────────────────────┘
        ←──── draggable resize handle ────→
```

### Behavior

- **Default split**: 60% left / 40% right.
- **Drag handle**: a vertical 6px-wide gripper between panes; cursor `col-resize`. Range 35%–80%. Grip ↑ vertical column of three dots; tint on hover.
- **Collapse**: a chevron button in the right header collapses the controls pane to 0px. A flyout tab pinned to the right edge re-opens it; the tab shows the current count of controls (e.g. "10 controls") rotated 90°.
- **Run as root** toggle lives in the script-section header. Off by default. When on, the toggle goes amber (`var(--lvl-w-fg)`). Scope is per-panel (not per-function).
- **Save panel / Discard** in the header. Discard prompts confirmation if dirty (not shown in mocks).

### Script editor (left pane)

- Line-numbered gutter on the left (muted, tabular-nums).
- Plain monospaced `<textarea>` in production. The mock uses a minimal syntax highlighter for visual fidelity:
  - Comments — `var(--fg-3)` italic
  - Strings — orange `oklch(0.78 0.13 60)`
  - Function names at top-of-line — blue `oklch(0.78 0.13 220)` bold
  - Variables (`$NAME`, `${NAME}`) — green `oklch(0.82 0.13 150)`
  - Keywords (`if`, `for`, etc.) — purple `oklch(0.78 0.13 300)`
- **Available variables** legend below the editor: a band of `$VAR` and `fn()` chips for everything the controls have declared. Each chip has a tooltip naming which control declared it.

### Controls list (right pane, top half)

- Scrollable, max 38% height of the right pane.
- Rows: drag-handle · kind icon · label · derived name · trash. Click to select (highlights in accent tint).
- **Section** rows render with their label uppercase + spacing — visually distinct from regular controls.
- **+ Add** button opens a control-type picker (not shown in the mocks — implement as a dropdown).
- **Drag-reorder** the rows to change panel order. Section rows reorder the same way; controls below a section "belong to" it visually.

### Per-control config (right pane, bottom half)

Selecting a row in the list swaps the form. Form variants by kind:

#### `ConfigButton` (action button)
- **Label** — drives function name. Help shows derived `force_stop()`.
- **Description** — textarea. Tooltip on hover at runtime.
- **Variant** — segmented: Default / Subtle / Destructive.
- **Confirm before running** — toggle. Off by default. (Discussed at length; no name-based auto-on heuristic.)
- **Bind output to** — dropdown. Default `console`.
- **Function preview** — read-only `<pre>` snippet of the function as defined in the script. Clicking jumps to its definition.

#### `ConfigInput` (text / slider / toggle / select / stepper / knob)
- **Label** — drives env var name. Help shows derived `$BRIGHTNESS`.
- **Description** + **"Show description inline"** checkbox (for the 5 input kinds that support inline).
- **Default value**.
- **Range** (slider/stepper/knob only): min, max, step.
- **Unit** — suffix shown next to the value.
- **On change** — segmented: "Refresh bound displays" / "Do nothing".

#### `ConfigReadout` (and similar displays)
- **Label** — display name only; doesn't affect function name.
- **Description**.
- **Bound to** — dropdown of script functions.
- **Unit**.
- **Auto-poll** — toggle + interval (seconds). **Off by default.**
- **Refresh on input change** — toggle. When on, the display re-runs eagerly whenever any input the function reads changes.

#### `ConfigConsole`
- **Label**.
- **Scope** — segmented: "Most recent run" (default) / "Scrollback".
- **Copy button** — toggle, on by default.
- **Auto-scroll** — toggle, on by default.

#### `ConfigSection`
- **Heading** (the title text).
- **Description** — textarea.
- Inline note: "Sections only affect display — they don't change scoping or the script env."

---

## States to handle

Surfaced as artboards on the design canvas under "Runtime states":

| State | Behavior |
|---|---|
| **Empty** | No controls yet. Friendly placeholder with a "Build your panel" CTA that opens the builder. |
| **Populated (small)** | Few controls. Most common shape. |
| **Populated (large)** | Many controls, multiple sections, with descriptions. See `PopulatedLarge` in `scripting-panel.jsx`. |
| **Busy** | A function is mid-run. Header gets a pulsing accent dot; the firing button shows a spinner; console header shows "running…". |
| **Last run errored** | Button shows red border + "exit 1" chip; console header shows red "exit 1" chip; error lines render in `var(--lvl-e-fg)`. |
| **Script syntax error** | Header gains the amber-red "script error" pill (tooltip explains, click opens builder). Controls still render but actions are disabled (mock doesn't show disabled styling — apply 50% opacity to the action button rail when implementing). |
| **Bars hidden** | `.bars-hidden` is set on the tile root; sections + console hidden. |
| **Tiny tile** | Single readout + single button — proves the panel reflows at any size. |

---

## State management

Per Scripting widget instance:

```ts
type ScriptingWidgetState = {
  script: string;                      // the shell script body
  runAsRoot: boolean;                  // panel-level
  controls: ControlConfig[];           // ordered, includes sections
  // Runtime:
  env: Record<string, string>;         // exported variable values
  scriptParseError: string | null;     // shown as header pill if non-null
  consoleRuns: Run[];                  // last-run by default, scrollback if user opts in
  pollHandles: Map<string, IntervalHandle>;
  inflight: Map<string, AbortController>;  // for cancelling stale display refreshes
};

type ControlConfig =
  | { id: string; kind: 'text' | 'slider' | 'toggle' | 'select' | 'stepper' | 'knob';
      label: string; description?: string; descInline?: boolean;
      defaultValue: ControlValue; min?: number; max?: number; step?: number; unit?: string;
      options?: string[];   // for select
      onChange: 'refresh' | 'none' }
  | { id: string; kind: 'button'; label: string; description?: string;
      variant: 'default' | 'subtle' | 'destructive'; confirm: boolean; bindOutputTo: string }
  | { id: string; kind: 'console' | 'readout' | 'status' | 'gauge' | 'led';
      label: string; description?: string; boundTo: string;   // a function name
      unit?: string; autoPoll: { enabled: boolean; intervalSec: number };
      refreshOnChange: boolean }
  | { id: string; kind: 'section'; title: string; description?: string };
```

### Derivation helpers

```ts
const slug = (s: string) =>
  s.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'UNNAMED';
const fnFromLabel = (s: string) => slug(s).toLowerCase();
const varFromLabel = (s: string) => '$' + slug(s);
```

These are the source of truth for what gets exported to the env (variables) and what gets called (functions). Compute them on the fly when rendering the builder legend.

### Polling and refresh-on-change

- **Polling**: each display with `autoPoll.enabled` gets a `setInterval` that calls its bound function and updates the value. Implementation: poll worker per widget; cancel any in-flight call when starting the next one.
- **Refresh on change**: when an input control's value changes, scan every display's `boundTo` function body for `$VAR_NAME` references; if the function reads the changed variable, schedule a re-run. While the new value is pending, the display shows the `stale` state (faint spinner + dimmed value). Use the same AbortController pattern to drop superseded calls.

### Confirm-before-run

A button with `confirm: true` opens a small confirmation popover (not designed in the mocks — implement as a 2-button popover: "Cancel" / "Run \<fn\>", positioned over the button). The lock-icon glyph in the button is a visual hint.

---

## Design tokens

All tokens come from existing `styles.css`. **No new ones.**

Key adds for this widget (all use existing tokens):
- `--sc-label-bg` — set on `.sw-body` to `oklch(from var(--bg-1) l c h)` so the Material-outlined label can opaquely mask the input border. Override per-context as needed.
- All accent / level / glass tokens used unchanged.

Recommend keeping all styles in a `scripting.css` (or `widget-scripting.css`) module that lives alongside the other widget CSS. The mocks inject styles inline via a `<style id="sc-styles">` block for self-contained-ness — that should be split out in production.

---

## Iconography

Five new icons needed in the existing icon set (`icons.jsx`), drawn in the same 24px-viewBox, stroke 1.6, currentColor style as the existing set:

- `Rotate` — knob control (curved arrow / dial)
- `SplitV` — slider control (horizontal rail + thumb)
- `Power` — toggle control (power-symbol glyph)
- `Hash` — number stepper / info dot
- `Wand` — Scripting widget glyph in the topbar palette + tile header

All other icons (`PlayCircle`, `Terminal`, `Lock`, `Folder`, `Copy`, `Check`, `Drag`, `Chevron`, `ChevronRight`, `Plus`, `Trash`, `Edit`, `Settings`, `Eye`, `EyeOff`, `Maximize`, `Close`, `Cpu`, `Battery`, `Network`) already exist.

The dashboard's widget palette gets a "Scripting" entry: `Wand` icon, name "Scripting", description "Build your own ADB control panel — one shell script, your controls."

---

## Interactions cheat sheet

| Action | Effect |
|---|---|
| Click ⚙ in tile header | Open builder modal |
| Click "script error" pill | Open builder modal, scroll to the error line in the editor |
| Click ⊙ copy on console header | Copy current console output to clipboard, show ✓ briefly |
| Click action button (no confirm) | Runs `fn()` immediately |
| Click action button (confirm=true) | Open confirmation popover |
| Drag a row in the builder controls list | Reorder controls + sections |
| Click ‹ chevron in builder right-pane header | Collapse the controls pane |
| Click flyout tab on collapsed pane | Re-expand the controls pane |
| Drag the vertical handle between builder panes | Resize split (35%–80%) |
| Toggle "Run as root" in builder | Toggle script invocation through `su` (per panel) |
| Toggle 👁 in tile header | Hide sections + console |

---

## Files

Under `source/`:

**Scripting widget (the design artifact)**
- `Scripting Widget Design.html` — the canvas, entry point. Open in a browser to see all artboards.
- `scripting-controls.jsx` — every control + the `SC_STYLES` CSS-in-JS block. **This is the reference for visual fidelity.**
- `scripting-panel.jsx` — runtime widget body — empty, populated, busy, error, script-error, bars-hidden, tiny, and the sections-focused App debugger panel.
- `scripting-builder.jsx` — builder modal: header, two-pane body, resize handle, collapsed state, per-control config forms (Button, Input, Readout, Console, Section).
- `scripting-canvas.jsx` — composes the above into design-canvas artboards. Not part of the production widget; included so the developer can see how every variant is exercised.

**Supporting (read-only references)**
- `styles.css` — full WebLogcat token set. Don't fork; reuse.
- `icons.jsx` — full icon set (existing + 5 new ones described above).
- `design-canvas.jsx` — the canvas wrapper. Not for production.

---

## Implementation order suggestion

1. **Stub the widget shell** — add a `widget-scripting.jsx` next to the other widgets, registered with the dashboard. Empty body, with a working cog → modal → close cycle.
2. **Implement controls (presentational)** — port `scripting-controls.jsx` straight across. They're side-effect-free.
3. **Implement the builder modal layout** — left pane, right pane, drag handle, collapse. Wire the in-memory state (no persistence yet).
4. **Implement the script execution layer** — one `shell:` channel per widget instance, kept open as a persistent env. Parse the script's function definitions; expose them as callable handles.
5. **Wire inputs → env** — every input edit emits an `export VAR=value` over the shell.
6. **Wire actions → calls** — `ScButton` press → invoke `fn()` over the shell, capture output to the console.
7. **Wire displays → bound calls** — same mechanism, plus the polling worker and the refresh-on-change observer.
8. **Persistence** — serialize per-widget state to `localStorage` (matches the dashboard layout persistence pattern).
9. **Error handling** — parse errors → script-error pill; runtime errors → error states on controls and console.

---

## Open items deferred to implementation

These were discussed during design but punted to the implementer's judgment:

- **Sensitive inputs** — should a text input have a "secret" flag that redacts its value in the console? Flag for a future round if it comes up.
- **Long-running commands** — current console design is "last run only". If a command produces a continuous stream, treat as "last run, but it never finishes" — show a stop button in the console header when busy.
- **Function-preview link** — clicking the `force_stop()` preview in the button config should scroll the script editor to its definition. Trivial; just left out of the mocks.
- **Add-control picker** — the `+ Add` button opens a picker (dropdown menu of control kinds with their icons). Mocks didn't draw it; implement as a popover keyed by the existing icon set.
