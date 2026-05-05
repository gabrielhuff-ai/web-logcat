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
