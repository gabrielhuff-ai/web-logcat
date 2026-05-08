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

Every shot is captured **twice** — once in dark mode, once in light.
The dark variant lands at the canonical filename; the light variant
is suffixed with `-light`.

| Output path | Used by |
| --- | --- |
| `docs/public/img/features/<slug>.png` | `<ThemeImage src-dark="...">` in the matching `docs/features/<slug>.md` page (dark theme) |
| `docs/public/img/features/<slug>-light.png` | `<ThemeImage src-light="...">` in the same page (light theme) |
| `docs/public/screenshot.png` | README hero image **and** the docs `image.dark` hero (single source of truth) |
| `docs/public/screenshot-light.png` | The docs `image.light` hero — VitePress swaps to it when the reader toggles light mode |

The dual-theme capture exists so feature pages render coherently for
readers regardless of which appearance they pick. Don't ship one
variant without the other; reviewers will bounce single-theme PRs.

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
2. For each `(feature, theme)` pair (the script wraps every feature
   capture in a `for theme of ['dark', 'light']` loop), seeds
   `localStorage` with `theme: <theme>` + `accent: 'indigo'` +
   `performanceMode: 'on'`, then loads the app and clicks **fake
   data** to drop into the simulator.
3. Asserts `<html data-theme=<theme>>` so the page actually rendered
   in the requested theme before snapshotting (Playwright's
   `addInitScript` runs before page scripts; if the seed didn't
   stick, this assertion catches it).
4. Writes the PNG to `docs/public/img/features/<slug>.png` (dark) or
   `…/<slug>-light.png` (light).

After it runs, **review every changed PNG** in *both* themes — open
each pair and confirm:

- The right widget rendered.
- No error overlay, no clipped content, no console-error toast
  bleeding through.
- The light variant actually reads as light (the dashboard's light
  theme has rough edges in some chrome — see
  [test-sync](./test-sync) if you find a regression worth fixing in
  the app itself rather than the docs).

The script asserts that the canonical DOM elements rendered, but it
can't tell you whether the composition is aesthetically right.

## Refreshing only the hero

The hero comes out of a dedicated `hero shot` capture that seeds
`localStorage` with a deterministic four-widget composition before
navigating, so the shot is bit-stable across regens. Two variants
ship — `screenshot.png` (dark) and `screenshot-light.png` (light).

The seeded state:

- **Tweaks** — `theme: <dark|light>`, `accent: 'indigo'` (matches the
  docs site's brand at hue 268), `compactMode: true`,
  `performanceMode: 'on'`.
- **Layout** — Mirror left (≈32% width), then a column split on the
  right with Logcat on top (≈62% height) and Shell | Dumpsys at the
  bottom (50/50).
- **Simulator hints** — same convention as the feature shots: the
  "Using simulated log data" toast is waited out and the "Simulated
  log stream" badge is hidden via an injected `display:none` rule
  before the screenshot fires. Readers shouldn't mistake those
  onboarding affordances for product chrome.

Re-run only the heroes without churning the other PNGs:

```bash
CHROMIUM_PATH=... npx playwright test \
  --config=playwright.screenshots.config.ts \
  -g 'hero shot'
```

It writes both variants. If the user asks specifically for *the
README screenshot*, both files are in scope — the same composition
is used for the docs landing.

To change the composition (different widgets, different ratios, a
different accent), edit the `localStorage.setItem` block in
`scripts/capture-feature-screenshots.spec.ts` under the
`hero shot` test. Layout payload shape lives in
[`src/lib/layout.ts`](https://github.com/gabrielhuff/web-logcat/blob/main/src/lib/layout.ts)
(`weblogcat-dashboard-v2`); tweak shape lives in
[`src/lib/tweaks.ts`](https://github.com/gabrielhuff/web-logcat/blob/main/src/lib/tweaks.ts)
(`weblogcat:tweaks:v1`).

## Authoring a feature page

Reference both variants via the global `<ThemeImage>` Vue component
(registered by `docs/.vitepress/theme/index.ts`):

```md
<ThemeImage
  src-dark="/img/features/<slug>.png"
  src-light="/img/features/<slug>-light.png"
  alt="..."
/>
```

The component reads `useData().isDark` and renders the right
variant; both src paths are absolute paths into `docs/public/`,
piped through `withBase()` so the rendered href is correct under
production / staging / local-dev base paths. Don't reach for the
plain markdown `![](./img/...)` syntax — the docs site's convention
is dual-theme.

## Adding a new capture

Add a `test('<short description>', …)` block **inside** the existing
`for (const theme of ['dark', 'light'])` describe loop in
`scripts/capture-feature-screenshots.spec.ts`. The harness then
captures it for both themes automatically. The pattern:

```ts
test('my new capture', async ({ page }) => {
  await bootSimulator(page, theme);
  // …drive the widget to the state you want to capture;
  // **wait on a DOM signal** that proves the state arrived
  // (don't `setTimeout` — it'll flake).
  await tile.screenshot({ path: out(theme, 'my-new-slug') });
});
```

Then reference both PNGs from the matching `docs/features/<page>.md`
via `<ThemeImage>`.

## Real-device-only flows

These cannot be captured by the script:

- Mirror's live screen frame — the simulator shows a static placeholder.
- Files transfers (drag-out / drag-in) — no-ops in the simulator.
- The WebUSB pairing dialog — Chromium chrome, not part of the page.

For these, capture manually against a real device and commit the PNG
pair (one per theme) under `docs/public/img/features/`. Flag the
source in the alt-text so a future regen doesn't quietly replace it.
