# Pending tasks

Ordered roughly by user-visible value.

## Phase 1 — UI parity with simulated stream

All components below were ported from `design/v1/source/` and wired into
`App.tsx`. Each was verified by `npm run typecheck`, `npm run lint`,
`npm run build` against the simulator on localhost.

- [x] **Toolbar** — brand, animated logo, device picker, theme toggle, export, settings
- [x] **FilterBar** — chip input + autocomplete with all 5 filter types as discoverable starters; Tab/Enter/Backspace/Esc semantics; per-color oklch chip palette
- [x] **LevelRow** — pill design (letter badge + name) with single-click toggle and double-click solo
- [x] **LogRow** — per-field highlight rendering (message/tag/pkg) and crash-head Show/Collapse stack-trace toggle
- [x] **EmptyState** — animated USB-cable + phone illustration with staged connect animation
- [x] **SettingsPanel** — theme segmented, 4-color accent grid, density segmented, heatmap + scrubber toggles
- [x] **SearchOverlay** — live match count, highlights via `hl-search`, esc dismisses
- [x] **Heatmap** — 60-cell gutter on the left of the log area. Click → jumps to ts in log list. (The bottom timeline scrubber from the original design has been deleted: it visualised the same buckets as the heatmap and its viewport rectangle wasn't wired to anything actionable.)
- [x] **Resume tail pill** — `.scroll-to-bottom` shown when `autoScroll` is off
- [x] **Toast** — bottom-centre, used for connect/disconnect/clear/export/theme messages
- [x] **List virtualisation** — `@tanstack/react-virtual` engages past 800 visible rows; pinned-block stays sticky outside the virtualised range

## Phase 2 — Real ADB transport

- [x] Add `@yume-chan/adb` + `@yume-chan/adb-daemon-webusb` + `@yume-chan/adb-credential-web` + `@yume-chan/stream-extra`
- [x] Implement `connectDevice` in `src/lib/adb.ts`:
  - Use `AdbDaemonWebUsbDeviceManager.BROWSER.requestDevice()`
  - `AdbDaemonTransport.authenticate({ serial, connection, credentialStore })`
  - Spawn `logcat -v threadtime` via `adb.subprocess.noneProtocol.spawn`
  - Pipe through `TextDecoderStream → SplitStringStream('\n')`
  - Parse with `parseLogcatLine`; resolve PID → package via `cat /proc/<pid>/cmdline` cache
- [x] Wire `connectDevice` into `App.tsx`'s `connectReal`; keep stream handle on a ref for clean stop
- [x] Surface device disconnect (cable pull) → toast + revert to empty state
- [x] **Real-hardware smoke test (Pixel 8 Pro).** Connect, AUTH, model
  name, log streaming, disconnect-on-cable-pull all confirmed working.
  Issues fixed in subsequent commits (heatmap visibility under
  horizontal scroll, rate display under TZ skew, scroll-locked viewport
  anchoring, "Pair new device" wiring). Future regressions will surface
  through ad-hoc use; no automated coverage planned (WebUSB can't be
  exercised in headless CI).
- [ ] _(declined)_ ~~Multi-device support.~~ Single-active-device is the
  product decision. The toolbar dropdown still accepts a list shape so
  this can be added later without a rewrite.

## Phase 3 — Polish

- [x] **Scroll anchoring on head trim.** When the FIFO trim evicts entries
  while scroll-locked, `scrollTop` is decremented by `(visible-entries-
  trimmed × rowHeight)` synchronously in `flushIncoming` — i.e. before
  setLogs is queued — so the virtualiser reads the new scrollTop on the
  same render that produces the new entries. Combined with the 50k hard
  cap, this means rows only disappear from the user's view once they
  themselves scroll past them or the buffer truly fills. The pixel-per-
  row math uses `virtualizer.getTotalSize() / count` (the measured
  average), so it stays correct under wrap mode where rows can be
  multi-line.
- [x] **Horizontal scroll when wrap mode is off.** Replaces the
  per-cell ellipsis with a row that grows to `max-content` width.
  Required swapping the virtualiser's absolute-positioning idiom for a
  padding-based one (absolute children don't contribute to parent
  intrinsic width), so the scroll container can detect overflow.
- [x] **Refine anchor math under wrap mode** — landed via the
  `getTotalSize() / count` change above; the measured average reflects
  actual heights to within a row or two, fine for wrap mode.
- [x] **Persist `filters` per device serial.** Stored under
  `weblogcat:filters:<serial>` in localStorage; restored when the same
  device reconnects. `makeFilter` is re-run on load so the in-session id
  counter stays consistent.
- [x] **`?` keyboard shortcut → help dialog.** `HelpDialog` lists all
  shortcuts; opens with `?`, closes on Esc / scrim / Close button.
- [x] _(reverted)_ ~~Hide "fake data" affordance in production.~~ Was
  briefly gated on `import.meta.env.DEV || ?dev=1` but restored to
  always-visible: the affordance is genuinely useful for anyone
  evaluating the UI without a phone in hand, and the cost of showing a
  link nobody will click is nil.
- [x] **Lazy-load `lib/adb.ts`** via dynamic import inside `connectReal`.
- [x] **Lazy-load `lib/logGenerator.ts`** the same way, fetched only
  when the user opts into fake data. The static name lists used for
  filter-bar autocomplete moved to `lib/knownNames.ts` so they stay in
  the initial bundle. Final shape: index 64 KB gzip, adb chunk 18 KB
  gzip (lazy), logGenerator chunk 4 KB gzip (lazy).
- [x] Verified the highlight palette matches the design's intent:
  message filters highlight all three of msg/tag/pkg, tag filters
  highlight tag only, process filters highlight pkg only. No change
  needed — the original wording in this list was speculative.

## Phase 4 — Tests + tooling

- [x] **Unit tests for `lib/filters.ts` and `parseLogcatLine`.** Vitest;
  24 tests covering the parser, matcher, highlighter, palette cycling,
  and the parser's resilience to malformed lines. CI runs `npm test`.
- [x] **Playwright smoke tests.** Run against a locally-served
  `vite preview` (not the deployed URL — keeps CI hermetic). Cover the
  empty state, simulator path, brand-click → empty state, filter chip +
  autocomplete, and `?` help dialog. The real WebUSB flow stays manual.
  CI runs them in a separate `e2e` job after `npx playwright install`.
- [x] **Tightened `react-hooks/exhaustive-deps` to error.** No skips
  needed — the codebase was already clean under the implicit
  warning-as-error rule. Made it explicit anyway.

---

# v2 — multi-widget dashboard

Spec: [`design/v2/HANDOFF.md`](../design/v2/HANDOFF.md). The v1 logcat
ships as one widget inside a draggable / resizable tile grid; four new
widgets (Shell, Dumpsys, Files, Mirror) join it. Phases 5–10 below are
ordered by dependency, then by user-visible value within each phase.
Pick the top unchecked item; each entry lists the file in
`design/v2/source/` it ports from.

## Phase 5 — Dashboard scaffold (v1 → v2 atomic swap)

Replace the connected layout (Toolbar + FilterBar + LevelRow + LogList)
with a tile dashboard hosting Logcat as the first widget kind. The
tasks below land in close succession (one short PR series, or a single
PR if the agent prefers) because the connected experience is broken
between the first and last item — there are no users to shield.

- [x] **v2 types in `src/types.ts`** — `WidgetKind` (union of
  `'logcat' | 'shell' | 'dumpsys' | 'files' | 'mirror'`), `Tile`
  (`{ id, kind, x, y, w, h, barsHidden? }`), `LayoutState`. Don't
  widen existing types.
- [x] **ADB transport context** — `src/lib/adbContext.ts` (the
  context + `useAdb()` hook) plus `src/lib/AdbProvider.tsx` (the
  provider). Split into two files so the hook+constant export
  doesn't trip the fast-refresh lint. Wraps the existing
  `connectDevice` from `lib/adb.ts` so widgets share one `Adb`
  handle.
- [x] **v2 CSS originals into `src/styles/`** —
  `src/styles/dashboard.css` is a verbatim copy of
  `design/v2/source/dashboard.css`. Diff against v1:
  `design/v2/source/styles.css` is identical to v1 except for two
  new tokens (`--shadow-3` and `--glass-line`); those were merged
  into `tokens.css` to keep the design originals tight. File
  table in `docs/ARCHITECTURE.md` updated.
- [x] **`Dashboard` shell + topbar** —
  `src/components/Dashboard.tsx` (`DashTopbar` inlined). The brand
  + device picker + theme toggle moved out of Toolbar.tsx, which
  is now deleted.
- [x] **`TileGrid` + drag / resize / persist** —
  `src/components/TileGrid.tsx` + `src/lib/layout.ts`. 12-col,
  56px rows, 10px gap, persisted under `weblogcat-dashboard-v1`.
  Plain pointer events with rAF coalescing; no `react-grid-layout`.
- [x] **Tile chrome** — `src/components/Tile.tsx`. Header (grip,
  icon, title, eye, maximize, remove), maximize-fills-viewport
  positioning, `bars-hidden` class flip. CSS rule lives in
  `src/styles/dashboard.css` (verbatim from the design original).
- [x] **Widget registry** — `src/lib/widgets.ts`. Maps
  `WidgetKind → { name, icon, desc, comp, defaultSize, enabled,
  maxInstances? }`. Logcat is the only `enabled: true` entry in
  Phase 5; Mirror has `maxInstances: 1`.
- [x] **`WidgetPalette` modal** — `src/components/WidgetPalette.tsx`.
  Renders all 5 cards; disabled cards grey out with a "Coming soon"
  tooltip. Mirror's card additionally greys with "Only one mirror
  at a time" if a Mirror tile already exists.
- [x] **Extract `LogcatWidget`** —
  `src/components/widgets/LogcatWidget.tsx`. Filter bar + level row
  + log area + heatmap + search overlay all per-instance.
  Keyboard shortcuts (Space / ⌘K / ⌘F / / / Esc) gated on focus
  inside the widget root. Per-tile filters persisted under
  `weblogcat:filters:<serial>:<tileId>`.
- [x] **Shared logcat stream** — `src/lib/logStream.ts` +
  `src/lib/logStreamContext.ts`. `LogStreamHub` keeps a single
  ring buffer (cap `MAX_LOGS = 5000`) and fans out to N
  `LogcatWidget` subscribers.
- [x] **Phase 5 smoke** — `npm run typecheck`, `npm run lint`,
  `npm run build`, `npm test` all green. Manual walk-through
  (empty → connect → default layout → add second Logcat → drag /
  resize / eye / maximize / remove / Reset layout → reload) done
  against the simulator.

## Phase 6 — Shell widget

- [ ] **`ShellWidget`** —
  `src/components/widgets/ShellWidget.tsx` ports
  `design/v2/source/widget-shell.jsx`. **No toolbar**, no split
  panes (HANDOFF §Shell Widget — multiple shells = multiple
  widget instances). Scrollback area + live prompt; ↑/↓ history;
  Ctrl+L clears. Line-based render — no `xterm.js`.
- [ ] **Real shell channel** — `adb.subprocess.shell.spawn()` per
  widget instance via `useAdb()`. Pipe stdin from the input;
  append stdout / stderr to scrollback; ANSI-strip in the
  renderer.
- [ ] **Simulator fallback** — when `usingFake` is true, run the
  built-in command list from `widget-shell.jsx` (`cd / ls / pwd /
  echo / cat / ps / getprop / whoami / id / uname / date / uptime
  / clear / exit / help`). Lives in `src/lib/shellSim.ts`. Keeps
  the no-phone path demo-able.
- [ ] **Enable Shell in `WidgetPalette`** — flip its card from
  greyed to active.

## Phase 7 — Dumpsys widget

- [ ] **`DumpsysWidget` shell** —
  `src/components/widgets/DumpsysWidget.tsx` ports
  `design/v2/source/widget-dumpsys.jsx`. Toolbar
  (`ds-toolbar widget-bar`): preset pills (Battery / Memory / CPU
  / GFX / Wi-Fi), Run, Refresh, Copy raw, parsed↔raw toggle. Body
  switches between parsed card grid and raw monospace.
- [ ] **Runner** — `src/lib/dumpsys.ts`:
  `runDumpsys(adb, preset) → { raw, parsed }` via
  `adb.subprocess.shell.spawnAndWait('dumpsys <service>')`.
- [ ] **Parsers** — one file per preset under
  `src/lib/dumpsys/parsers/`: `battery.ts`, `memory.ts`
  (`meminfo system_server`), `cpu.ts` (`cpuinfo`), `gfx.ts`
  (`gfxinfo`), `wifi.ts`. Pure text → typed shape. Vitest
  fixtures under `src/lib/dumpsys/__fixtures__/<preset>.txt`
  captured from a real Pixel — same testing convention as
  `lib/filters.ts`.
- [ ] **Cards** — one component each under
  `src/components/widgets/dumpsys/`: `BatteryCard` (level ring,
  charge, temp, voltage, current, health), `MemoryCard` (Pss /
  Private Dirty stack, Java/Native donut, top-procs table),
  `CpuCard` (per-core bars, top by CPU%, load avgs),
  `GfxCard` (frame-time histogram, HWUI metrics),
  `WifiCard` (SSID + RSSI + link speed, scan results table).
- [ ] **Enable Dumpsys in `WidgetPalette`**.

## Phase 8 — Files widget

- [ ] **Sync wrapper** — `src/lib/sync.ts` over `adb.sync()`:
  `list(path)`, `read(path) → ReadableStream`,
  `write(path, stream, onProgress)`. Progress events fire for
  files >1MB.
- [ ] **`FilesWidget`** —
  `src/components/widgets/FilesWidget.tsx` ports
  `design/v2/source/widget-files.jsx`. Toolbar
  (`fx-toolbar widget-bar`): back / forward / up / refresh /
  new-folder / Push / Pull / breadcrumb. Tree pane (220px,
  rooted at `/`) + list pane (sortable: name / size / modified /
  perms; multi-select with Shift/Ctrl).
- [ ] **Push / Pull** — drag-out → Pull: stream `sync.read`
  into a Blob, trigger download. Drag-in → Push: read the
  dropped `File` via `.stream()` into `sync.write`. Show
  progress for >1MB. New-folder via `mkdir` over a shell
  channel (sync protocol doesn't expose it directly).
- [ ] **Enable Files in `WidgetPalette`**.

## Phase 9 — Screen Mirror widget

Highest-risk, highest-reward. Tasks split fine-grained because each is
its own PR-sized milestone with a verifiable demo.

- [ ] **Vendor scrcpy server + add deps** — pin
  `scrcpy-server-v2.7.jar` (Apache-2.0; widest device support
  while staying current — scrcpy v2.7 still supports Android 5.0+
  / API 21, which covers virtually all in-use devices) under
  `public/scrcpy/scrcpy-server-v2.7.jar`. Add
  `@yume-chan/scrcpy` + `@yume-chan/scrcpy-decoder-webcodecs`
  to `package.json` and to CLAUDE.md's "Acceptable additions"
  list. If yume-chan's current release targets a different scrcpy
  version, follow yume-chan's compatibility matrix instead — note
  the chosen pair in `src/lib/scrcpy.ts`.
- [ ] **Static `MirrorWidget` skeleton** —
  `src/components/widgets/MirrorWidget.tsx` ports
  `design/v2/source/widget-mirror.jsx` pixel-perfectly: SVG
  bezel, `mr-toolbar widget-bar` with the three button groups
  and `mr-sep` dividers, tap-ripple effect on the screen
  surface. Uses the simulated `MirrorAppFrame` SVG from the
  design source for now — no real video yet.
- [ ] **scrcpy session lib** — `src/lib/scrcpy.ts`. Push the
  jar to `/data/local/tmp/scrcpy-server.jar`, start
  `app_process`, open `localabstract:scrcpy`, return
  `{ video, control, dispose }` where `video` is a
  `ReadableStream<Uint8Array>` of NAL units and `control` is a
  typed sender for `injectTouch`, `injectKeyCode`,
  `setScreenPowerMode`, etc.
- [ ] **WebCodecs decode → canvas** — replace the simulated
  SVG frame with a `<canvas>` driven by
  `@yume-chan/scrcpy-decoder-webcodecs` and
  `requestVideoFrameCallback`. Canvas lives outside React's
  render tree; only the toolbar + REC pill rerender. Bezel
  styling stays.
- [ ] **Touch injection** — wire the existing tap handler in
  `MirrorWidget` to `control.injectTouch()`. Scale viewport
  pixels → device source pixels, handle rotation events on
  the control channel without remounting the canvas.
- [ ] **Hardware buttons** — Back / Home / Menu / Vol± / Power
  → scrcpy keycodes (`KEYCODE_BACK`, `KEYCODE_HOME`,
  `KEYCODE_APP_SWITCH`, `KEYCODE_VOLUME_UP/DOWN`,
  `KEYCODE_POWER`). Power additionally toggles
  `setScreenPowerMode` so the device screen stays off when
  appropriate.
- [ ] **Recording** — add `mp4-muxer` dep. Tee video NAL units
  into the muxer alongside the decoder; on Stop, save the
  resulting Blob via download. REC pill + timer come from
  the existing widget UI; pulse + `.rec` class already in
  the design CSS.
- [ ] **Screenshot** — snapshot the current `VideoFrame`
  to a 2D canvas → PNG via `canvas.toBlob()`.
- [ ] **Hard-cap concurrent Mirror tiles at 1** — registry
  entry gets `maxInstances: 1`; `TileGrid.addTile` and
  `WidgetPalette` consult it. Mirror's palette card is disabled
  with tooltip "Only one mirror at a time" while a Mirror tile
  exists. Product decision — keeps the scrcpy server count and
  USB bandwidth predictable.
- [ ] **Latency / jank pass** — Pixel 8 Pro, USB-2 and USB-3,
  measure end-to-end latency with a stopwatch + tap-flash
  test app. Target ≤150ms USB-2, ≤80ms USB-3. Document the
  measured number in this entry.
- [ ] **Enable Mirror in `WidgetPalette`**.

## Phase 10 — Polish

- [ ] **Lazy-load widget chunks** — each non-Logcat widget kind
  is dynamically imported on first add (mirrors the existing
  `lib/adb.ts` / `lib/logGenerator.ts` lazy pattern from Phase 3).
  Biggest win is the Mirror chunk (scrcpy decoder + muxer).
- [ ] **CSS originals re-split** — once all widgets land, mirror
  the v1 convention: per-widget design CSS pulled verbatim from
  `design/v2/source/widget-<kind>.jsx`'s `<style>` block into
  `src/styles/widgets/<kind>.css`. Deltas continue to live in
  `components.css`. Keeps refreshes from `design/v2/source/`
  merge-conflict-free.
- [ ] **Playwright smoke for the dashboard** — extend
  `e2e/`: add tile, drag, resize, eye, maximize, remove,
  reset layout, palette open/close. WebUSB-dependent flows
  stay manual.
- [ ] **README + screenshot refresh** — new dashboard
  screenshot under `docs/screenshot.png`; update the feature
  blurb from "logcat viewer" to "Android device inspector".
- [ ] **Migration purge** — once Phase 5 lands, delete
  `src/components/Toolbar.tsx` (its bits live in `Dashboard`'s
  topbar now). No backwards-compat shims per `CLAUDE.md`.
