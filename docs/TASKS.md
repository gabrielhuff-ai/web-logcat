# Pending tasks

Ordered roughly by user-visible value.

## Phase 1 — UI parity with simulated stream

All components below were ported from `design/source/` and wired into
`App.tsx`. Each was verified by `npm run typecheck`, `npm run lint`,
`npm run build` against the simulator on localhost.

- [x] **Toolbar** — brand, animated logo, device picker, theme toggle, export, settings
- [x] **FilterBar** — chip input + autocomplete with all 5 filter types as discoverable starters; Tab/Enter/Backspace/Esc semantics; per-color oklch chip palette
- [x] **LevelRow** — pill design (letter badge + name) with single-click toggle and double-click solo
- [x] **LogRow** — per-field highlight rendering (message/tag/pkg) and crash-head Show/Collapse stack-trace toggle
- [x] **EmptyState** — animated USB-cable + phone illustration with staged connect animation
- [x] **SettingsPanel** — theme segmented, 4-color accent grid, density segmented, heatmap + scrubber toggles
- [x] **SearchOverlay** — live match count, highlights via `hl-search`, esc dismisses
- [x] **Heatmap** + **Scrubber** — 60-cell gutter and timeline scrubber. Click heatmap → jumps to ts in log list
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
- [ ] **Test against real hardware.** The transport compiles and follows
  the upstream API, but it has not been exercised against a real Pixel/
  Galaxy. First run on the deployed staging URL is the integration test.
  Likely follow-ups based on what real hardware reveals:
  - Banner/model parsing edge cases (`adb.banner.model` may be undefined
    on some OEMs; `safeGetProp('ro.product.model')` is the fallback)
  - PID → pkg via `cmdline` may need a more robust parser for app processes
    that are forked from zygote (`zygote64` placeholder until the rename)
  - Year-rollover for the threadtime timestamp (cosmetic)
- [ ] **Multi-device support.** The toolbar shape already accepts a list,
  but `App.tsx` only tracks one stream at a time. Worth adding when there's
  a real "switch device" use case.

## Phase 3 — Polish

- [ ] Persist `filters` across reloads (localStorage, scoped per device serial)
- [ ] `?` keyboard shortcut to open a help dialog with the shortcut list
- [ ] Decide whether to keep "fake data" affordance in production (or hide
  it behind `?dev=1`)
- [ ] Wire the **Scrubber** to actually scrub the log viewport, not just
  visualise it. Right now it renders the buckets and a fixed window
  rectangle but `onScrub` is a no-op
- [ ] Tighten the highlight palette: tag-typed filters currently also
  highlight pkg cells via the `tag||message` rule — verify this matches
  the design's intent or restrict it
- [ ] Inspect bundle: `index-*.js` is ~85 KB gzipped; the bulk is the
  yume-chan ADB client + WebCrypto. Consider lazy-loading `lib/adb.ts`
  via dynamic import so the empty state and simulated path stay tiny

## Phase 4 — Tests + tooling

These are deliberately deferred until features stop churning.

- [ ] Unit tests for `lib/filters.ts` and `parseLogcatLine` (the highest-
  ROI tests; pure functions, easy)
- [ ] Add Playwright smoke test on the deployed staging URL
- [ ] Tighten ESLint to include `react-hooks/exhaustive-deps` as `error`
  once the few intentional skips are commented
