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
  // The dashboard ships two onboarding affordances that mark the
  // session as fake — the bottom-centre "Using simulated log data"
  // toast (auto-dismisses after ~1.8 s) and the lower-right
  // "Simulated log stream" badge that stays for the duration of the
  // session. Both are useful in the live app and confusing in
  // captured screenshots, so we wait for the toast and hide the
  // badge before any caller takes a shot.
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5_000 });
  await page.addStyleTag({
    content: '.fake-badge,.toast{display:none!important}',
  });
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

  test('simulator landing', async ({ page }) => {
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
  });

  // README hero composition.
  //
  // The hero needs a deterministic layout (Mirror left full-height,
  // Logcat top-right, Shell + Dumpsys bottom-right), the teal accent,
  // and compact mode — building it via "+ Add widget" clicks would
  // depend on the dwindle's split-direction heuristic and isn't
  // bit-stable. Seed localStorage directly so the same composition
  // lands every regen.
  //
  // Unlike the cleaner feature shots, this one *keeps* the
  // "Simulated log stream" badge visible — readers landing from the
  // README see the same affordance the live simulator session shows,
  // which matches the README's "no phone? simulated stream" framing.
  test('README hero shot', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      // Tweaks: teal accent + compact mode, performance mode on so
      // tile transitions don't render mid-easing.
      localStorage.setItem(
        'weblogcat:tweaks:v1',
        JSON.stringify({
          accent: 'teal',
          compactMode: true,
          performanceMode: 'on',
        }),
      );
      // Dashboard layout: Mirror left (~32%), then a column split on
      // the right with Logcat on top (~62%) and Shell|Dumpsys at the
      // bottom (50/50).
      localStorage.setItem(
        'weblogcat-dashboard-v2',
        JSON.stringify({
          tiles: {
            w_mirror: { id: 'w_mirror', kind: 'mirror' },
            w_logcat: { id: 'w_logcat', kind: 'logcat' },
            w_shell: { id: 'w_shell', kind: 'shell' },
            w_dumpsys: { id: 'w_dumpsys', kind: 'dumpsys' },
          },
          tree: {
            type: 'split',
            dir: 'row',
            ratio: 0.32,
            a: { type: 'leaf', id: 'w_mirror' },
            b: {
              type: 'split',
              dir: 'col',
              ratio: 0.62,
              a: { type: 'leaf', id: 'w_logcat' },
              b: {
                type: 'split',
                dir: 'row',
                ratio: 0.5,
                a: { type: 'leaf', id: 'w_shell' },
                b: { type: 'leaf', id: 'w_dumpsys' },
              },
            },
          },
          focusId: 'w_logcat',
        }),
      );
    });

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // Four tiles, in the configured composition.
    await expect(page.locator('.tile')).toHaveCount(4);
    await expect(page.locator('.lc-widget')).toBeVisible();
    await expect(page.locator('.mr-widget')).toBeVisible();
    await expect(page.locator('.sh-widget')).toBeVisible();
    await expect(page.locator('.ds-widget')).toBeVisible();
    // Wait for the log stream to start so the Logcat tile isn't empty.
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
    // Settle Dumpsys' default preset.
    await expect(
      page.locator('.tile')
        .filter({ has: page.locator('.ds-widget') })
        .locator('.ds-card-head')
        .first(),
    ).toContainText(/charge/i);
    // Wait out the connect-toast (the badge stays — see comment above).
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5_000 });
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
