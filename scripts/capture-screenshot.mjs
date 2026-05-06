// Capture the README screenshot. Invoked from the screenshot workflow:
// the workflow builds the app, serves it via `vite preview` on
// localhost:4173, then runs this script to render the simulated-data
// dashboard view to docs/screenshot.png.
//
// v2: the connected app is a Dashboard hosting a tile grid (Mirror,
// Logcat, Shell, Dumpsys by default). The script scopes filter chip
// + scroll interactions to the first Logcat tile so a busy log stream
// with highlighted matches shows up alongside the other widgets.
//
// Plain ESM (no TypeScript) so we can run it under `node` directly
// without spinning up tsx/ts-node.
//
// Imports `chromium` from `@playwright/test` (a direct devDependency)
// rather than `playwright` (a transitive). `npm ci` doesn't promise to
// hoist transitive deps to the top level, so the direct import is the
// only one we can rely on.

import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:4173/';
const OUT = process.env.OUT ?? 'docs/screenshot.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  // Render at 2x for a crisp screenshot — README displays at half-size
  // on retina screens otherwise.
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'load' });

// Enter the simulator so the screenshot shows the connected dashboard,
// not the empty state.
await page.getByRole('button', { name: /fake data/i }).click();

// Wait for the dashboard topbar + the four default tiles to mount.
await page.waitForSelector('.dash-brand-name', { timeout: 5_000 });
await page.waitForSelector('.tile', { timeout: 5_000 });

// Logcat is index 1 in the canonical default layout (Mirror, Logcat,
// Shell, Dumpsys). Wait for at least one streaming row in it.
const logcatTile = page.locator('.tile').nth(1);
await logcatTile.locator('.row').first().waitFor({ timeout: 5_000 });

// Add two free-text chips that match many entries across both message
// and tag/process columns. With only-matches off (toggled below) this
// gives a screenshot full of representative rows with two chip colours
// highlighted across them, instead of an empty filtered view.
const input = logcatTile.locator('.fb-input');
await input.click();
for (const chip of ['android', 'chrome']) {
  await input.fill(chip);
  await page.keyboard.press('Enter');
}

// Adding the first chip auto-enables only-matches; toggle it back off
// so the screenshot shows a full lived-in stream with highlights, not
// a sparse filtered view. The button lives at the right end of the
// filter bar; its data-tt tooltip starts with "Show" when on, "Showing"
// when off — `^="Show"` matches both.
await logcatTile
  .locator('.filter-bar > button[data-tt^="Show"]')
  .click();

// Dismiss the autocomplete dropdown and unfocus the input.
await page.keyboard.press('Escape');

// Let the buffer fill so the heatmap and rate display look lived-in.
await page.waitForTimeout(3000);

// Scroll the Logcat tile's log list up so the "Resume tail" pill is
// visible — the LogList re-enables auto-scroll whenever the viewport
// is at the bottom, so we can't toggle it from a toolbar; we have to
// actually move the scroll position above the tail.
await logcatTile.locator('.log-scroll').evaluate((el) => {
  el.scrollTop = Math.max(0, el.scrollTop - 240);
});
await page.waitForTimeout(800);

await page.screenshot({ path: OUT, fullPage: false });
await browser.close();

console.log(`Wrote ${OUT}`);
