# Handoff: WebLogcat — Browser-based Android Logcat Viewer

## Overview
WebLogcat is a single-page web app that connects to Android devices over USB (via WebUSB + the ADB protocol) and streams `logcat` output live in the browser. It's intended as a zero-install alternative to `adb logcat` and Android Studio's Logcat panel — a developer or QA engineer plugs in a phone, hits Connect, and sees live logs with real filtering, search, pinning, and crash-trace collapse.

## About the Design Files
The files under `source/` are **design references created in HTML/CSS/JSX** — a high-fidelity prototype showing intended look and behavior, **not production code to copy directly**. The streaming logs are simulated via `log-generator.jsx`; there is no real WebUSB/ADB code in this bundle.

The task is to **recreate this design in the target codebase's environment**. If no codebase exists yet, the recommended stack is:

- **Vite + React + TypeScript** (the design is already React)
- **CSS Modules or vanilla CSS** with the same custom-property token system shown here
- **WebUSB + a JS ADB client** (e.g. [`@yume-chan/adb`](https://github.com/yume-chan/ya-webadb)) for the real device transport — replace the simulated stream in `app.jsx`'s `setInterval` with a subscription to ADB shell `logcat -v threadtime`.

## Fidelity
**High-fidelity.** Final colors (defined in `oklch()` with theme + accent hue variables), typography (JetBrains Mono throughout), spacing scale, log-row layout, animation timings, and interactions are all production-intent. Recreate pixel-perfectly.

## Layout — Top to Bottom

The app is a fixed full-viewport flex column. When **not connected**, only `<EmptyState>` renders. When connected, the column is:

1. **Toolbar** (52px tall) — `toolbar.jsx`
2. **Filter bar** (52px min) — `filter-bar.jsx`
3. **Level row** (40px) — level pills + live rate + counts + pinned summary
4. **Log area** (fills) — heatmap gutter (optional) + scrolling log list
5. **Scrubber** (optional, bottom) — `heatmap.jsx`

Floating overlays: `<SettingsPanel>` slide-in (right), `<SearchOverlay>` (top-right, ⌘F), toast (bottom-center), "Resume tail" pill (bottom-right when scroll-locked), "Simulated log stream" badge (bottom-left when fake data).

## Screens / Views

### 1. Empty State (`empty-state.jsx`)
- Centered card on full canvas
- Animated USB-cable illustration (SVG with stroked path, dashes animate)
- Heading: "Connect an Android device"
- Body copy explains WebUSB requirement
- Primary button: **"Connect a device"** (calls `navigator.usb.requestDevice` in real impl)
- Ghost link: **"Use simulated data"** (development affordance — keep or remove for production)
- Subtle grid background mask + radial fade

### 2. Toolbar (`toolbar.jsx`)
Left → right:
- **Brand** — three small accent-colored squares (animated pulse) + "weblogcat" wordmark
- **Divider**
- **Device picker** — status dot (online/offline/fake) + model name + serial + Android version. Click opens dropdown listing all connected devices, "Pair new device…", "Disconnect all"
- **Spacer** (flex 1)
- **Theme toggle** — sun/moon icon, swaps `tweaks.theme`
- **Export** — saves filtered logs as `.txt` (`logcat-{serial}-{timestamp}.txt`)
- **Settings** — opens slide-in panel

### 3. Filter Bar (`filter-bar.jsx`)
Left → right:
- **Transport group** — Pause/Resume (Space), Clear (⌘K), Auto-scroll/Lock toggle
- **Divider**
- **Chip input** — multi-tag input. Existing filters render as colored pill chips with × button. Typing in the input triggers autocomplete:
  - On focus with empty draft: shows **all 5 filter types** as starters (`process:`, `tag:`, `pid:`, `level:`, `message:`) under a "FILTER BY — pick a type or just type to highlight" header — this is critical for syntax discoverability
  - Typing `tag:` shows known tags from the live log stream
  - Typing `process:` shows known package names
  - Plain text without colon offers "message contains \"…\"" entry
  - Enter commits, Tab autocompletes, Backspace on empty removes last chip
- **Filter (only-matches) toggle** — hollow filter icon → filled filter icon when active. Disabled when no filters
- **Divider**
- **Display toggles** — `ts` (timestamps), `pid` (PID/TID column), `wrap` (wrap long lines). Each is a small text+icon pill that turns accent-colored when active.

### 4. Level Row
Below the filter bar:
- **5 level pills**: V D I W E with colored letter badges (each level has its own `oklch` hue: V gray, D blue, I green, W amber, E red)
- Single click toggles, **double click solos** that level (turns off all others)
- Disabled levels show line-through on the label
- **Live rate** dot pulsing green + `{N}/s` + `{filtered}/{total}`
- **Pinned summary** appears when any rows are pinned: "{N} pinned" + clear link

### 5. Log Area (`log-row.jsx`, `heatmap.jsx`)
- **Heatmap gutter** (optional, off by default) — vertical strip of 60 cells, one per second of the last minute. Cell color = dominant level in that bucket; cell opacity = log volume. Click a cell to jump to that timestamp.
- **Scroll region** — vertically + horizontally scrollable. Auto-tails to bottom; if user scrolls up, auto-scroll disengages and a "Resume tail" pill appears.
- **Pinned block** — sticky top section showing pinned rows, with "PINNED" header
- **Log row** layout (flex, `white-space: nowrap` unless wrap mode):
  1. 2px colored rail (left edge — yellow for W, red for E, accent for matched)
  2. Pin button (18px, hidden until row hover)
  3. Timestamp cell (168px, tabular nums) — if `showTimestamps`
  4. PID-TID cell (96px) — if `showPid`
  5. Package cell (220px, ellipsis)
  6. Tag cell (180px, ellipsis, weight 500)
  7. Level badge (18×18 rounded square, V/D/I/W/E with level-tinted background)
  8. Message (flex 1, `pre` whitespace; `pre-wrap` if wrap on)
- **Crash rows** — error stack-trace lines render with red message color + light red row tint. The first line of each crash group has a "Show stack trace" toggle that collapses subsequent stack-frame lines.
- **Highlight marks** — `<mark>` ranges colored by filter chip palette. Search highlights use accent color with a 1px outline. Highlights apply to message, tag, and pkg cells (all three for type-less filters; only message for `message:` filter; only tag for `tag:`; only pkg for `process:`).

### 6. Settings Panel (`settings.jsx`)
Slide-in from right (440px wide, scrim behind). Sections:
- **Appearance**: Theme segmented (Light/Dark), Color scheme grid (Indigo, Teal, Amber, Rose — each shifts the `--accent-hue` variable)
- **Display**: Density segmented (compact/cozy/comfortable), Heatmap gutter toggle, Timeline scrubber toggle (both off by default)
- **About**: blurb about WebUSB + ADB

### 7. Search Overlay (⌘F / Ctrl+F)
Floating box top-right. Live search across message/tag/pkg, with match count. Esc dismisses.

## Interactions & Behavior

| Action | Effect |
|---|---|
| Space | Toggle pause |
| / | Focus filter input |
| ⌘F / Ctrl+F | Open search overlay |
| ⌘K / Ctrl+K | Clear logs |
| Esc | Close search overlay |
| Click level pill | Toggle that level |
| Double-click level pill | Solo (only that level) |
| Click pin gutter on row | Pin/unpin |
| Click "Show stack trace" | Expand crash group |
| Scroll up in log area | Disengage auto-scroll |
| Click "Resume tail" | Re-engage auto-scroll |
| Connect device | `navigator.usb.requestDevice` → open ADB shell → spawn `logcat -v threadtime` → parse lines → push to log buffer |

**Animation timings** (`styles.css`):
- `--dur-fast: 120ms` — hover, button states
- `--dur: 200ms` — panel transitions, theme swap
- `--dur-slow: 360ms` — settings drawer
- `--ease-out: cubic-bezier(0.2, 0, 0, 1)` — most enter animations
- `--ease-spring: cubic-bezier(0.34, 1.3, 0.64, 1)` — toast, button-press feel

## State Management

State lives in `app.jsx` as `useState`/`useReducer`:
- `connected`, `device`, `usingFake`
- `logs[]` — capped at 5000 entries (FIFO trim)
- `filters[]` — `[{id, type, value, color, regex?}]`
- `levelEnabled` — `{V, D, I, W, E}` booleans
- `search`, `searchOpen`
- `onlyMatches`, `paused`, `autoScroll`
- `pinned: Set<id>`, `expanded: Set<id>` (crash heads)
- Tweakable persisted state (`useTweaks`): `theme`, `accent`, `density`, `showTimestamps`, `showPid`, `wrapLines`, `showHeatmap`, `showScrubber`, `streamingSpeed`

For the real implementation, the log stream and filter system are pure functions of `logs` + `filters` + `levelEnabled` — keep them memoized. With high log rates, **virtualize the list** (`react-window` or `@tanstack/react-virtual`) — the prototype renders all rows, which won't scale past ~5k entries.

## Filter System (`filters.jsx`)

Filter types: `process`, `tag`, `pid`, `level`, `message`. A filter is `{id, type, value, color, regex}`. Plain text without a colon becomes a `message`-type filter that matches against message **and** tag **and** pkg.

`Filters.entryMatches(entry, filters)` returns the array of matched filters (used for row highlighting + only-matches mode). `Filters.makeFilter(text, paletteSize)` parses raw text into a filter, picking the next color in the palette. `Filters.highlightRanges` returns `[{start, end, color}]` ranges for a given field.

## Design Tokens

All in `styles.css`:

**Spacing**: 4 / 8 / 12 / 16 / 20 / 24 / 32 px
**Radii**: sm 4 / md 8 / lg 12 / pill 999
**Type scale** (mono): xs 10.5 / sm 11.5 / base 12.5 / md 13.5 / lg 16 / xl 20 / 2xl 28
**Font**: JetBrains Mono (400/500/600/700) — UI **and** logs

**Color tokens** are computed from `--accent-hue` (set per accent scheme) using `oklch()`. Each theme defines `--bg-{0..3}`, `--bg-hover`, `--line`, `--fg-{0..3}`, `--accent`, `--accent-soft`, `--accent-fg`, `--on-accent`, plus per-level `--lvl-{v|d|i|w|e}-{fg|bg}` and a 6-color filter chip palette (`--fc-1` through `--fc-6`).

**Accent hues**: indigo 268°, teal 190°, amber 60°, rose 12°.
**Level hues**: V 240° / D 220° / I 150° / W 50° / E 12°.

Use `oklch()` for new colors so they stay perceptually consistent across themes; do not hardcode hex.

## Assets
- **Font**: JetBrains Mono via Google Fonts
- **Icons**: All inline SVG (`icons.jsx`) — 24×24 viewBox, `currentColor`. Replaceable with any icon library (Lucide is closest in stroke style).
- **No images** — illustrations are SVG.

## Real ADB Integration Notes (out of scope for this bundle)

When wiring up the real transport, replace `setInterval(generateBatch, 600)` in `app.jsx` with:
1. `navigator.usb.requestDevice({ filters: [{ classCode: 0xFF, subclassCode: 0x42, protocolCode: 0x01 }] })`
2. ADB AUTH handshake (RSA key exchange) — use `@yume-chan/adb` to skip writing this yourself
3. `shell:logcat -v threadtime` stream
4. Parse each line: `MM-DD HH:MM:SS.mmm  PID  TID L TAG: message`
5. Resolve PID → package name via `dumpsys package` or `/proc/{pid}/cmdline`
6. Push parsed entries into the same `logs` state shape the prototype uses

## Files

Under `source/`:
- `WebLogcat.html` — entry point, script tags
- `styles.css` — design tokens, themes, base styles, tooltip, scrollbar
- `app.css` — layout, log row, panels, overlays
- `app.jsx` — root component, state, effects, keyboard
- `toolbar.jsx` — top bar + device picker dropdown
- `filter-bar.jsx` — chip input + autocomplete + transport + display toggles
- `filters.jsx` — filter parsing/matching logic
- `log-row.jsx` — single row + highlight rendering
- `log-generator.jsx` — **simulation only** — synthesizes plausible Android logs; replace with real ADB stream
- `heatmap.jsx` — heatmap gutter + scrubber
- `settings.jsx` — settings panel + level filter pills
- `empty-state.jsx` — pre-connection screen
- `icons.jsx` — inline SVG icons
- `tweaks-panel.jsx` — design-tool tweaks scaffold; **discard** in production
