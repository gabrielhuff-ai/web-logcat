# Pending tasks

Ordered roughly by user-visible value. The first batch is the natural
"continue where Opus left off" path for Sonnet.

## Phase 1 — Bring the UI to design parity (simulated stream)

Each item has a one-to-one source under `design/source/`. Port the design,
wire it into `App.tsx`, manually verify against the simulator. Keep PRs
small (one or two components per PR is ideal).

- [ ] **Toolbar** — `design/source/toolbar.jsx`
  - Brand block with animated three-square logo
  - Device picker dropdown (status dot, model, serial, Android version,
    "Pair new device…", "Disconnect all")
  - Theme toggle (sun/moon, swaps `tweaks.theme`)
  - Export button — already wired in `App.tsx`, just style it
  - Settings button
- [ ] **FilterBar** — `design/source/filter-bar.jsx`
  - Pause/Resume, Clear, Auto-scroll toggle (transport group)
  - **Chip input with autocomplete.** Critical UX detail: on focus with
    empty draft, the dropdown shows ALL 5 filter types as starters
    (`process:`, `tag:`, `pid:`, `level:`, `message:`) under a header
    "FILTER BY — pick a type or just type to highlight". This is the
    only discoverability for the syntax — don't skip it.
  - Tab autocompletes; Enter commits; Backspace on empty removes last chip
  - Display toggles (`ts`, `pid`, `wrap`) on the right
- [ ] **LevelRow** — already functional; finish the pill visuals so they
  match the per-level oklch colours, and confirm double-click solo
- [ ] **LogRow / highlight rendering** — `design/source/log-row.jsx`
  - Render `highlightRanges` results into `<mark class="hl hl-cN"/>`
  - Crash row tinting + "Show stack trace" collapse on the first crash
    line of each group; subsequent lines in the group fold
  - Apply highlights to message, tag, and pkg cells per the spec table
- [ ] **EmptyState illustration** — `design/source/empty-state.jsx`
  - Animated USB-cable SVG (stroked path with dashed animation)
  - Grid background mask + radial fade
  - Multi-step "connecting" state for the Connect button
- [ ] **SettingsPanel** — `design/source/settings.jsx`
  - Theme segmented (Light / Dark)
  - Color scheme grid (Indigo / Teal / Amber / Rose) → `tweaks.accent`
  - Density segmented (compact / cozy / comfortable)
  - Heatmap gutter + Timeline scrubber toggles
- [ ] **SearchOverlay** — finish: live count, highlight matches with
  `.hl-search` class, ↑/↓/Enter to step through matches
- [ ] **Heatmap** — `design/source/heatmap.jsx`
  - 60-cell vertical gutter
  - Cell color = dominant level in 1s bucket; opacity = volume
  - Click → jump to ts in the log list
- [ ] **"Resume tail" pill** — bottom-right; show when `autoScroll` is
  off; clicking re-engages auto-scroll
- [ ] **Toast component** — bottom-centre; reuse for "Cleared", "Copied",
  "Filter added", etc.

## Phase 2 — Performance

- [ ] **Virtualise the log list.** Add `@tanstack/react-virtual`. Pinned
  rows stay outside the virtualised range (sticky block at the top of
  the scroll region).
- [ ] **Memoise filter matching.** Once `filters.length > 5` the per-row
  `entryMatches` call dominates render. Cache by `(entry.id, filtersKey)`.

## Phase 3 — Real ADB transport

The simulator hides the hard part. See `src/lib/adb.ts` for the stub.

- [ ] Add `@yume-chan/adb` and `@yume-chan/adb-daemon-webusb` (MIT,
  maintained, pure JS — handles AUTH + framing).
- [ ] Implement `connectDevice` in `src/lib/adb.ts`:
  1. `navigator.usb.requestDevice({ filters: [{ classCode: 0xFF, subclassCode: 0x42, protocolCode: 0x01 }] })`
  2. Hand the USB device to `AdbDaemonWebUsbDeviceManager` and complete
     the auth handshake (RSA — yume-chan does this for you).
  3. Open `shell:logcat -v threadtime` and wire it through
     `parseLogcatLine`.
  4. Resolve PID → package name. `dumpsys package` is heavy; cache pid→pkg
     once at startup and refresh when a process restarts (hint: the
     `Start proc <pid>:<pkg>` ActivityManager log line).
- [ ] Wire `App.tsx`'s `connectReal` to the new `connectDevice` and remove
  the temporary `alert()` placeholder.
- [ ] Surface device state changes (cable pulled, screen locked → adb
  disconnects): toast + revert to empty state.
- [ ] Multi-device support: device picker in the toolbar already accepts
  a list shape. The transport must keep one stream per selected device.

## Phase 4 — Polish

- [ ] Persist filters across reloads (localStorage, scoped per-device-serial)
- [ ] Export filtered logs as `.txt` — verify the existing `App.tsx`
  implementation matches the spec filename `logcat-{serial}-{timestamp}.txt`
- [ ] Keyboard shortcut hint dialog (the `?` key)
- [ ] Tighten ESLint to `--max-warnings 0` once stubs are filled
- [ ] Decide whether to keep the "Use simulated data" affordance in
  production or hide it behind a `?dev=1` flag
