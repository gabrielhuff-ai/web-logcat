// Screenshot capture for the docs site. Drives the WebLogcat simulator
// through each widget and writes PNGs that the `docs/features/*.md`
// pages reference.
//
// Run via:  npm run docs:screenshots
//
// The capture is intentionally an opt-in script (separate Playwright
// config; never invoked by CI) so a UI change can land without
// regenerating images and so a flaky capture doesn't block merges.
//
// Conventions:
//   - PNGs go to docs/features/img/<slug>.png
//   - One canonical hero shot per feature, plus task shots where the
//     flow is non-obvious
//   - Capture against the simulator only — real-device flows (Mirror's
//     live frame, Files transfers, the WebUSB pairing dialog) cannot
//     be captured headlessly and are documented as static placeholders

import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.resolve(here, '..', 'docs', 'features', 'img');
// Hero shot consumed by both README.md and docs/index.md. Lives under
// docs/public/ so VitePress serves it at the docs site root, and is
// referenced from README.md by relative path.
const HERO_PATH = path.resolve(here, '..', 'docs', 'public', 'screenshot.png');

function out(name: string): string {
  return path.join(IMG_DIR, `${name}.png`);
}

// Pre-seed every page with a clean slate + performance mode pinned on
// (matches tests/smoke.spec.ts so layout transitions don't appear
// mid-frame in the captured PNGs).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem(
        'weblogcat:tweaks:v1',
        JSON.stringify({ performanceMode: 'on' }),
      );
    } catch {
      /* SecurityError in some sandbox configs — ignore */
    }
  });
});

async function bootSimulator(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /fake data/i }).click();
  // Wait for the dashboard to settle before snapshotting.
  await expect(page.locator('.dash-brand-name')).toBeVisible();
  await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
}

async function addWidget(
  page: Page,
  label: RegExp,
  widgetClass: string,
): Promise<Locator> {
  const before = await page.locator(widgetClass).count();
  await page.getByRole('button', { name: /add widget/i }).click();
  await page.locator('.palette-card').filter({ hasText: label }).click();
  await expect(page.locator(widgetClass)).toHaveCount(before + 1);
  return page.locator('.tile').filter({ has: page.locator(widgetClass) }).last();
}

test.describe('feature screenshots', () => {
  test('empty state', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /no device connected/i }),
    ).toBeVisible();
    await page.screenshot({ path: out('empty-state'), fullPage: false });
  });

  test('simulator empty state (badge visible)', async ({ page }) => {
    await bootSimulator(page);
    await page.screenshot({ path: out('simulator-empty'), fullPage: false });
  });

  test('topbar', async ({ page }) => {
    await bootSimulator(page);
    const topbar = page.locator('.dash-top');
    await topbar.screenshot({ path: out('topbar') });
  });

  test('dashboard default layout', async ({ page }) => {
    await bootSimulator(page);
    await page.screenshot({ path: out('dashboard-default'), fullPage: false });
  });

  test('dashboard multi-widget layout (hero shot)', async ({ page }) => {
    // Build a representative four-widget layout against the simulator
    // so the docs hero shot mirrors the marketing screenshot in
    // README. The default mounts as a single Logcat tile; we add the
    // other three to populate the dwindle layout.
    await bootSimulator(page);
    await addWidget(page, /Screen Mirror/, '.mr-widget');
    await addWidget(page, /Shell/, '.sh-widget');
    await addWidget(page, /Dumpsys/, '.ds-widget');
    await expect(page.locator('.tile')).toHaveCount(4);
    // Settle Dumpsys' default preset before the snapshot so the cards
    // render rather than a half-rendered loader.
    await expect(
      page.locator('.tile')
        .filter({ has: page.locator('.ds-widget') })
        .locator('.ds-card-head')
        .first(),
    ).toContainText(/charge/i);
    await page.screenshot({ path: out('dashboard-multi'), fullPage: false });
    // The hero shot is the same composition — write it a second time
    // to docs/public/screenshot.png so README.md and the VitePress
    // landing page stay in lockstep with the multi-widget capture.
    await page.screenshot({ path: HERO_PATH, fullPage: false });
  });

  test('logcat tile (default)', async ({ page }) => {
    await bootSimulator(page);
    const tile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    await tile.screenshot({ path: out('logcat-default') });
  });

  test('logcat tile with chips', async ({ page }) => {
    await bootSimulator(page);
    const tile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    const input = tile.locator('.fb-input');
    await input.focus();
    await input.fill('tag:Activity');
    await input.press('Enter');
    await expect(tile.locator('.chip')).toHaveCount(1);
    await tile.screenshot({ path: out('logcat-chips') });
  });

  test('logcat pinned row', async ({ page }) => {
    await bootSimulator(page);
    const tile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    const firstRow = tile.locator('.row').first();
    await firstRow.hover();
    const pin = firstRow.locator('button[aria-label*="Pin"], .row-pin').first();
    if (await pin.count()) {
      await pin.click({ force: true });
    }
    await tile.screenshot({ path: out('logcat-pinned') });
  });

  test('shell tile', async ({ page }) => {
    await bootSimulator(page);
    const tile = await addWidget(page, /Shell/, '.sh-widget');
    const input = tile.locator('input[aria-label="Shell input"]');
    await input.focus();
    await input.fill('pwd');
    await input.press('Enter');
    await expect(tile).toContainText('/sdcard');
    await input.fill('help');
    await input.press('Enter');
    await tile.screenshot({ path: out('shell-default') });
  });

  test('dumpsys tile', async ({ page }) => {
    await bootSimulator(page);
    const tile = await addWidget(page, /Dumpsys/, '.ds-widget');
    await expect(tile.locator('.ds-card-head').first()).toContainText(/charge/i);
    await tile.screenshot({ path: out('dumpsys-default') });
  });

  test('files tile', async ({ page }) => {
    await bootSimulator(page);
    const tile = await addWidget(page, /Files/, '.fx-widget');
    await expect(tile.locator('.fx-crumb.current')).toContainText('Download');
    await tile.screenshot({ path: out('files-default') });
  });

  test('mirror tile', async ({ page }) => {
    await bootSimulator(page);
    const tile = await addWidget(page, /Screen Mirror/, '.mr-widget');
    await expect(tile.locator('.mirror-svg')).toBeVisible();
    await tile.screenshot({ path: out('mirror-default') });
  });
});
