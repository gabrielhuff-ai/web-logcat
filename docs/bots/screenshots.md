# Screenshot pipeline (for agents)

WebLogcat ships with a Playwright script that drives the
[simulator](../features/simulator) and writes PNGs that both the docs
site and the README depend on. Use it whenever:

- A UI change makes one of the existing screenshots look wrong.
- A new widget / feature needs a hero shot.
- The user asks you to refresh the README screenshot or any docs
  imagery.

## Where the script lives

```
scripts/capture-feature-screenshots.spec.ts   # the captures
playwright.screenshots.config.ts              # standalone playwright config
```

The script is **not** part of `npm run e2e` — it's invoked explicitly
via `npm run docs:screenshots` so a flaky capture never blocks merges
and a UI change can land without a forced regen.

## Outputs

| Output path | Used by |
| --- | --- |
| `docs/features/img/<slug>.png` | The matching `docs/features/<slug>.md` page on the docs site |
| `docs/public/screenshot.png` | `README.md` hero image **and** `docs/index.md` hero block (single source of truth — the docs hero composition is also the README composition) |

## Refreshing screenshots

```bash
# 1. Build the app so the preview server has fresh dist/.
npm run build

# 2. Run the capture (uses vite preview at localhost:4173).
npm run docs:screenshots
```

In environments where Playwright cannot fetch its pinned Chromium
build, point at any preinstalled Chromium 1194+ binary:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npm run docs:screenshots
```

The script:

1. Boots `vite preview` on port 4173.
2. Loads the app, clicks **fake data** to drop into the simulator.
3. For each capture, waits for the relevant DOM to settle, then
   writes the PNG to `docs/features/img/<slug>.png`.
4. The `dashboard-multi` capture additionally writes the same frame
   to `docs/public/screenshot.png` so the README hero stays in
   lockstep.

After it runs, **review every changed PNG** before committing — open
each one and confirm it shows what you expect (right widget, no error
overlay, no clipped content, no console-error toast bleeding through).
The script asserts that the canonical DOM elements rendered, but it
can't tell you whether the composition is aesthetically right.

## Refreshing only the README hero

The hero comes out of the `dashboard multi-widget layout (hero shot)`
test, which writes both `dashboard-multi.png` and `screenshot.png`.
Re-run only that one to refresh the README without churning the other
PNGs:

```bash
CHROMIUM_PATH=... npx playwright test \
  --config=playwright.screenshots.config.ts \
  -g 'hero shot'
```

If the user asks specifically for *the README screenshot*, that's
this one.

## Adding a new capture

Follow the existing pattern in
`scripts/capture-feature-screenshots.spec.ts`:

1. Add a `test('<short description>', async ({ page }) => { … })`
   block.
2. Boot the simulator with `await bootSimulator(page);`.
3. Add the widget if needed via `await addWidget(page, /Name/,
   '.<kind>-widget');`.
4. Drive the widget to the state you want to capture; **wait on a
   DOM signal** that proves the state arrived (don't `setTimeout` —
   it'll flake).
5. Write the file via `await tile.screenshot({ path: out('<slug>') });`
   (tile-scoped) or `await page.screenshot({ path: out('<slug>'),
   fullPage: false });` (full viewport).
6. Reference the new PNG from the matching `docs/features/<page>.md`.

## Real-device-only flows

These cannot be captured by the script:

- Mirror's live screen frame — the simulator shows a static placeholder.
- Files transfers (drag-out / drag-in) — no-ops in the simulator.
- The WebUSB pairing dialog — Chromium chrome, not part of the page.

For these, capture manually against a real device and commit the PNG
under `docs/features/img/`. Flag the source in the alt-text so a
future regen doesn't quietly replace it.
