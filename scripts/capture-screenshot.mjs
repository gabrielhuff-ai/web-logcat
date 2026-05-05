// Capture the README screenshot. Invoked from the screenshot workflow:
// the workflow builds the app, serves it via `vite preview` on
// localhost:4173, then runs this script to render the simulated-data
// view to docs/screenshot.png.
//
// Plain ESM (no TypeScript) so we can run it under `node` directly
// without spinning up tsx/ts-node.

import { chromium } from 'playwright';

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

// Enter the simulator so the screenshot shows the actual product, not
// the empty state.
await page.getByRole('button', { name: /fake data/i }).click();

// Wait for the toolbar + first few rows to render.
await page.waitForSelector('.tb-name', { timeout: 5_000 });
await page.waitForSelector('.row', { timeout: 5_000 });

// Add two free-text chips that match many entries across both message
// and tag/process columns. With only-matches off (toggled below) this
// gives a screenshot full of representative rows with two chip colours
// highlighted across them, instead of an empty filtered view.
const input = page.locator('.fb-input');
await input.click();
for (const chip of ['android', 'chrome']) {
  await input.fill(chip);
  await page.keyboard.press('Enter');
}

// Adding the first chip auto-enables only-matches; toggle it back off
// so the screenshot shows a full lived-in stream with highlights, not
// a sparse filtered view.
await page.locator('.filter-bar > button.icon-btn').click();

// Dismiss the autocomplete dropdown and unfocus the input.
await page.keyboard.press('Escape');

// Let the buffer fill so the heatmap and rate display look lived-in.
await page.waitForTimeout(3000);

// Scroll the log list up so the "Resume tail" pill is visible —
// the LogList re-enables auto-scroll whenever the viewport is at the
// bottom, so we can't toggle it from a toolbar; we have to actually
// move the scroll position above the tail.
await page.locator('.log-scroll').evaluate((el) => {
  el.scrollTop = Math.max(0, el.scrollTop - 240);
});
await page.waitForTimeout(800);

await page.screenshot({ path: OUT, fullPage: false });
await browser.close();

console.log(`Wrote ${OUT}`);
