# Handoff: WebLogcat — Multi-Widget Android Device Inspector

> **v2 — adds Dashboard + Shell, Dumpsys, Files, Screen Mirror widgets.**
> v1 of this bundle covered only the Logcat viewer. See **[Diff vs v1](#diff-vs-v1)** at the bottom for what changed.

## Overview
WebLogcat is a single-page web app that connects to Android devices over USB (via WebUSB + the ADB protocol) and exposes ADB-style diagnostics live in the browser. Originally a logcat viewer, it is now a **dashboard of inspector widgets** — each widget is one ADB capability, tiled on a draggable / resizable grid that the user composes for their device-debugging session.

Widgets in this version:
1. **Logcat** — live filtered log stream (the entire v1 app, now wrapped as a tile)
2. **Shell** — interactive ADB shell. **One shell per widget** — multiple shells = multiple widget instances
3. **Dumpsys** — preset `dumpsys` commands (battery, meminfo, cpuinfo, gfxinfo, wifi) with parsed cards
4. **Files** — browse, push, pull device files
5. **Screen Mirror** — scrcpy-style live screen + hardware-button bar + record / screenshot

## About the Design Files
The files under `source/` are **design references created in HTML/CSS/JSX** — a high-fidelity prototype showing intended look and behavior, **not production code to copy directly**. All device data is simulated; there is no real WebUSB/ADB code in this bundle.

The task is to **recreate this design in the target codebase's environment**. If no codebase exists yet, the recommended stack is:

- **Vite + React + TypeScript**
- **CSS Modules or vanilla CSS** with the same custom-property token system shown here
- **WebUSB + a JS ADB client** (e.g. [`@yume-chan/adb`](https://github.com/yume-chan/ya-webadb)) for the real transport. Each widget then maps to one ADB primitive:
  - Logcat → `shell:logcat -v threadtime`
  - Shell → `shell:` (interactive)
  - Dumpsys → `shell:dumpsys <service>`
  - Files → `sync:` (LIST / RECV / SEND)
  - Screen Mirror → either scrcpy-server stream over ADB, or `screenrecord --output-format=h264 -` piped through the page
- For real screen mirroring, use the **scrcpy** server binary pushed via ADB and demuxed in a `<canvas>`/`MediaSource`.

## Fidelity
**High-fidelity.** Final colors (defined in `oklch()` with theme + accent hue variables), typography (JetBrains Mono throughout), spacing scale, widget layouts, animation timings, and interactions are all production-intent. Recreate pixel-perfectly.

---

## App Shell

Two top-level states:

1. **Disconnected** — `<EmptyState>` only (unchanged from v1).
2. **Connected** — `<Dashboard>` renders. The old single-purpose Toolbar + Filter bar are **gone**; their pieces are split between the dashboard topbar and per-widget headers.

### Dashboard Topbar (`dashboard.jsx → DashTopbar`)
Left → right:
- **Brand** — accent squares + "WebLogcat" wordmark + "Dashboard" sublabel
- **Device picker** (status dot + model + serial + Android version, dropdown to switch / disconnect)
- **Spacer**
- **+ Add widget** (opens palette modal)
- **Reset layout** (icon button)
- Divider
- **Theme toggle** (sun/moon)

### Widget Palette (`dashboard.jsx → WidgetPalette`)
Modal with scrim. 5 cards, one per widget kind. Each card: icon + name + 1-line description. Click adds an instance at the bottom of the grid.

### Tile Grid
- 12-column CSS grid, fixed row height (56px), 10px gap.
- Each tile = `{ id, kind, x, y, w, h, barsHidden? }`.
- **Drag tile header** to move (snaps to grid). **Drag bottom-right corner** to resize.
- Layout persists in `localStorage` under `weblogcat-dashboard-v1`.
- Default layout: Mirror (3w × 10h) | Logcat (9w × 6h) above | Shell (5w × 4h) + Dumpsys (4w × 4h) below.

### Tile Chrome (every widget)
Each tile has a **header** (36px) and a **body**.

Header: `[grip] [icon] [Title] ……… [👁 toggle bars] [⛶ maximize] [✕ remove]`

- **👁 toggle bars** — flips `barsHidden` on the tile. CSS rule `.tile.bars-hidden .widget-bar, .tile.bars-hidden .lc-toolbar, .tile.bars-hidden .ds-toolbar, .tile.bars-hidden .fx-toolbar, .tile.bars-hidden .mr-toolbar, .tile.bars-hidden .filter-bar { display: none !important }` collapses the widget's internal toolbar so its content area maximizes (like a "hide HUD" toggle in games). Icon: `Eye` when bars visible, `EyeOff` when hidden.
- **⛶ maximize** — fills the dashboard viewport (absolute positioning over the grid). Header changes to `Minimize` icon.
- **✕ remove** — deletes the tile from the layout.

When a tile is maximized, drag-to-move and drag-to-resize are disabled (cursor stays default on the header).

---

## Widgets

### 1. Logcat Widget (`widget-logcat.jsx`)
The entire v1 logcat experience, scoped to a single tile. Internal layout (top to bottom):
- **Filter bar** (`filter-bar.jsx`) — chip input + transport (pause/clear/auto-scroll) + display toggles (ts/pid/wrap) + only-matches toggle. **Has class `widget-bar`** so the bars-hidden toggle collapses it.
- **Level row** — V/D/I/W/E pills + live rate + pinned summary
- **Log area** — heatmap gutter + scrolling log list + pinned sticky block

All filter / search / pin / crash-collapse / heatmap / scrubber behavior is unchanged from v1.

### 2. Shell Widget (`widget-shell.jsx`)
Single interactive ADB shell. **No toolbar.** **No split panes.** If the user wants more shells, they add more Shell widgets.

Layout: scrollback area fills the body. Last line is the live prompt:
```
shiba:/sdcard $ █
```
- Prompt host in green (`oklch(0.74 0.16 150)`), cwd in blue (`oklch(0.78 0.13 220)`), `$` in muted gray.
- Built-in commands (sandboxed): `cd`, `ls`, `pwd`, `echo`, `cat`, `ps`, `getprop`, `whoami`, `id`, `uname`, `date`, `uptime`, `clear`, `exit`, `help`. Anything else → `inaccessible or not found`.
- **↑/↓** scroll command history. **Ctrl+L** clears.
- Real implementation: open one ADB `shell:` channel per widget instance; pipe stdin from the input field, append stdout/stderr to history.

### 3. Dumpsys Widget (`widget-dumpsys.jsx`)
Preset-driven inspector for `dumpsys`.

Internal layout:
- **Toolbar** (`ds-toolbar`, class `widget-bar`) — preset selector pills (Battery / Memory / CPU / GFX / Wi-Fi), Run button, Refresh, Copy raw, Toggle parsed/raw view.
- **Body** — either a parsed card grid (default) or raw monospace dump.

Each preset has its own parsed view:
- **Battery** — level gauge ring, charging state, temperature, voltage, current, health
- **Memory** (`meminfo system_server`) — Pss / Private Dirty / Heap stack bars, Java/Native split donut, top processes table
- **CPU** (`cpuinfo`) — per-core usage bars, top processes by CPU%, load averages
- **GFX** (`gfxinfo`) — frame time histogram (jank / 16ms / 30ms+), HWUI metrics
- **Wi-Fi** — current SSID + RSSI + link speed, scan results table

Real implementation: shell out to `dumpsys <service>`, capture stdout, run it through a parser per preset.

### 4. Files Widget (`widget-files.jsx`)
Two-column file browser.

Internal layout:
- **Toolbar** (`fx-toolbar`, class `widget-bar`) — back / forward / up / refresh / new folder / **Push** / **Pull** / breadcrumb path
- **Tree pane** (left, 220px) — collapsible folder tree rooted at `/`
- **List pane** (right) — current dir contents: name, size, modified, perms. Sortable. Multi-select with Shift/Ctrl. Drag a file out to download (Pull). Drag a file in to upload (Push).

Real implementation: ADB `sync:` protocol — `LIST` for directory entries, `RECV` for pull, `SEND` for push. Show progress for files >1MB.

### 5. Screen Mirror Widget (`widget-mirror.jsx`)
scrcpy-style live device screen.

Internal layout:
- **Toolbar** (`mr-toolbar`, class `widget-bar`) — three button groups separated by vertical dividers (`<span class="mr-sep" />`):
  - Group 1: **Back · Home · Menu**
  - Group 2: **Volume Up · Volume Down · Power**
  - Group 3: **Record · Screenshot**

  All buttons are 26×26 ghost icon buttons (`.mr-hw`). Record button gets `.rec` class while recording (red tint + pulse animation).

- **Stage** — phone bezel rendered in pure SVG, centered, aspect 360:760, max-height fills the body. Click the screen to inject a tap ripple at that point. While recording, an `REC · MM:SS` pill floats top-right of the screen.

The mirror screen content is a simulated shopping app frame (`MirrorAppFrame` SVG component). In production, replace with a real video element fed from the scrcpy demuxer.

---

## Interactions Cheat Sheet

| Action | Effect |
|---|---|
| Drag tile header | Move tile (snaps to grid) |
| Drag tile bottom-right corner | Resize tile |
| Click 👁 in tile header | Hide / show that widget's internal bars |
| Click ⛶ in tile header | Maximize / restore tile |
| Click ✕ in tile header | Remove tile |
| **+ Add widget** in topbar | Open palette modal |
| **Reset layout** in topbar | Restore default tile arrangement |
| Logcat: Space / ⌘K / ⌘F / / / Esc | Pause / Clear / Search / Focus filter / Close search (only when a logcat widget is focused) |
| Shell: ↑ ↓ | Command history |
| Shell: Ctrl+L | Clear scrollback |
| Mirror: Click screen | Inject tap ripple |
| Mirror: Click Record | Start/stop screen-record (shows REC pill + timer) |

## State Management

- **Top-level** (`app.jsx`): `connected`, `device`, `devices[]`, `usingFake`, theme/tweaks.
- **Dashboard** (`dashboard.jsx`): `layout[]` (persisted), `paletteOpen`, `maximized` (id or null), `drag` (in-flight drag state).
- **Per-widget**: each widget owns its own state. Widgets receive `device` as a prop and re-mount cleanly when the device changes.

For real ADB, lift the ADB transport into a context provider so every widget can call `adb.shell()` / `adb.sync()` without re-establishing the USB connection.

## Design Tokens

All in `styles.css` + `dashboard.css`. Unchanged from v1:
- **Spacing**: 4 / 8 / 12 / 16 / 20 / 24 / 32 px
- **Radii**: sm 4 / md 8 / lg 12 / pill 999
- **Type scale** (mono): xs 10.5 / sm 11.5 / base 12.5 / md 13.5 / lg 16 / xl 20 / 2xl 28
- **Font**: JetBrains Mono (400/500/600/700)
- Colors: `oklch()` driven by `--accent-hue`. Theme defines `--bg-{0..3}`, `--fg-{0..3}`, `--accent`, `--glass-line`, level/filter palettes.

New dashboard-specific tokens (in `dashboard.css`):
- Tile shell: `border: 1px solid var(--glass-line)`, `border-radius: 10px`, `background: var(--bg-1)`, subtle 0/8/16 shadow
- Tile header height: **36px**
- Grid row height: **56px**, gap **10px**, columns **12**

## Files

Under `source/`:

**App shell**
- `WebLogcat.html` — entry, script tags
- `app.jsx` — root, connect/disconnect, device list
- `app.css`, `styles.css`, `dashboard.css` — tokens + layout

**Dashboard**
- `dashboard.jsx` — grid, drag/resize, palette, tile chrome (incl. bars-hidden toggle)

**Widgets**
- `widget-logcat.jsx`, `widget-shell.jsx`, `widget-dumpsys.jsx`, `widget-files.jsx`, `widget-mirror.jsx`

**Logcat sub-modules** (used by `widget-logcat.jsx`)
- `filter-bar.jsx`, `filters.jsx`, `log-row.jsx`, `heatmap.jsx`, `toolbar.jsx`, `settings.jsx`, `log-generator.jsx`

**Misc**
- `empty-state.jsx`, `icons.jsx`, `tweaks-panel.jsx` (discard in production)

---

## Diff vs v1

v1 of this handoff described **only the logcat viewer** as the entire app. v2 wraps that experience in a multi-widget dashboard.

### Added
- **`dashboard.jsx` + `dashboard.css`** — tile grid, drag/resize, palette modal, `localStorage` persistence, per-tile chrome (header + maximize + remove + **bars-hidden toggle**).
- **5 widget files** — `widget-logcat.jsx`, `widget-shell.jsx`, `widget-dumpsys.jsx`, `widget-files.jsx`, `widget-mirror.jsx`.
- **Widget registry** in `dashboard.jsx` — maps `kind → { name, icon, desc, comp, defaultSize }`. Adding a new widget = add an entry + a component.
- **Bars-hidden mode** — every widget toolbar uses class `widget-bar` (or one of `lc-toolbar` / `ds-toolbar` / `fx-toolbar` / `mr-toolbar` / `filter-bar`). The dashboard toggles `.bars-hidden` on the tile root, and CSS `display: none !important` hides those toolbars to maximize content area.
- **New icons** (`icons.jsx`): `Stack`, `Terminal`, `Folder`, `FolderOpen`, `File`, `Mirror`, `Dumpsys`, `Camera`, `Record`, `Drag`, `Maximize`, `Minimize`, `Upload`, `Download`, `Eye`, `EyeOff`, `Layout`.

### Changed
- **Top-level layout**: v1 was `Toolbar → FilterBar → LevelRow → Logs`. v2 is `DashTopbar → Grid of Tiles`. The old toolbar's brand + device picker + theme toggle moved into `DashTopbar`. **Export and Settings buttons moved out of the global toolbar** — settings became dashboard-level (theme/accent only); export is per-widget where relevant.
- **Filter bar, level row, log area, search, heatmap, scrubber, settings panel, pinned rows**: behavior unchanged, but now scoped to a single Logcat tile. Multiple Logcat widgets can coexist with independent filter state.
- **Mirror widget toolbar**: only **3 button groups separated by dividers** — (Back, Home, Menu) | (Vol Up, Vol Down, Power) | (Record, Screenshot). No metrics/FPS/bitrate badges.
- **Shell widget**: **single shell only**, **no toolbar**. Multiple shells = multiple widget instances. (Earlier iterations had split panes + a toolbar; both removed.)

### Removed
- Global Logcat toolbar as the app's primary chrome. The brand/device/theme bits moved to `DashTopbar`; everything else moved into the Logcat widget header.
- Mirror widget metrics readout (FPS / bitrate / latency badges) — not useful in the new compact toolbar.
- Shell split-pane code path.

### Migration Notes for Implementers Coming from v1
If a v1 implementation already exists in the target codebase:
1. Wrap the existing logcat root in a `<LogcatWidget>` component that takes `device` as a prop.
2. Build the dashboard shell (`<Dashboard>` + `<TileGrid>` + `<WidgetPalette>`).
3. Move global brand/device/theme controls into the dashboard topbar; delete them from the logcat-internal toolbar.
4. Add `widget-bar` class (or `lc-toolbar` for logcat specifically) to every widget's internal toolbar so the bars-hidden toggle catches it.
5. Implement Shell, Dumpsys, Files, Mirror against the same ADB transport context.
