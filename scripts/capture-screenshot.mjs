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

// Add a representative filter chip so the screenshot demonstrates the
// chip palette + only-matches highlighting.
const input = page.locator('.fb-input');
await input.click();
await input.fill('tag:ActivityManager');
await page.keyboard.press('Enter');

// Let the buffer fill so the heatmap and rate display look lived-in.
await page.waitForTimeout(3000);

await page.screenshot({ path: OUT, fullPage: false });
await browser.close();

console.log(`Wrote ${OUT}`);
