// Screenshot capture for the docs site. Drives the WebLogcat simulator
// through each widget and writes PNGs that the `docs/features/*.md`
// pages reference via `<ThemeImage>` (theme-swapped at render time).
//
// Run via:  npm run docs:screenshots
//
// The capture is intentionally an opt-in script (separate Playwright
// config; never invoked by CI) so a UI change can land without
// regenerating images and so a flaky capture doesn't block merges.
//
// Conventions:
//   - Each test runs twice — once with `theme: 'dark'`, once with
//     `theme: 'light'` — and writes the result to
//     `docs/public/img/features/<slug>.png` (dark) and
//     `<slug>-light.png` (light). VitePress's `<ThemeImage>` Vue
//     component reads `useData().isDark` and swaps the two at
//     render time.
//   - One canonical hero shot per feature, plus task shots where the
//     flow is non-obvious.
//   - Capture against the simulator only — real-device flows (Mirror's
//     live frame, Files transfers, the WebUSB pairing dialog) cannot
//     be captured headlessly and are documented as static placeholders.

import { test, expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.resolve(
  here,
  '..',
  'docs',
  'public',
  'img',
  'features',
);
// Hero shot consumed by both README.md and docs/index.md. Lives under
// docs/public/ so VitePress serves it at the docs site root, and is
// referenced from README.md by relative path. Two variants: a dark
// hero (the README + docs default) and a light hero used by
// VitePress's `image.light` mapping when the docs reader has light
// mode active.
const HERO_PATH = path.resolve(here, '..', 'docs', 'public', 'screenshot.png');
const HERO_LIGHT_PATH = path.resolve(
  here,
  '..',
  'docs',
  'public',
  'screenshot-light.png',
);

type Theme = 'dark' | 'light';

/** PNG path for a feature shot, suffixed with `-light` for light theme. */
function out(theme: Theme, name: string): string {
  return path.join(
    IMG_DIR,
    theme === 'dark' ? `${name}.png` : `${name}-light.png`,
  );
}

/**
 * Boot the simulator with the given theme + indigo accent +
 * performance mode. The accent matches the docs site's brand; the
 * performance flag matches tests/smoke.spec.ts so layout transitions
 * don't appear mid-frame in the captured PNGs.
 *
 * Hides the simulator-only "Using simulated log data" toast + the
 * lower-right "Simulated log stream" badge — both are useful in the
 * live app and confusing in static screenshots that readers might
 * mistake for product chrome.
 */
async function bootSimulator(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.clear();
      localStorage.setItem(
        'weblogcat:tweaks:v1',
        JSON.stringify({
          theme: t,
          accent: 'indigo',
          performanceMode: 'on',
        }),
      );
    } catch {
      /* SecurityError in some sandbox configs — ignore */
    }
  }, theme);

  await page.goto('/');
  await page.getByRole('button', { name: /fake data/i }).click();
  await expect(page.locator('.dash-brand-name')).toBeVisible();
  await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
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

// ---- Per-theme feature shots ------------------------------------------------
//
// The double-nested `for` loop produces one Playwright test per
// (feature, theme) pair, all inside a single describe so the
// reporter groups them sensibly. Each test seeds its own theme via
// `bootSimulator(page, theme)` — the page-level state isolation
// Playwright already provides means tests don't leak into each
// other, even though they share the same dev server.

for (const theme of ['dark', 'light'] as const) {
  test.describe(`feature screenshots (${theme})`, () => {
    test('empty state', async ({ page }) => {
      // The empty state doesn't go through the simulator, so we
      // seed the theme directly before navigation.
      await page.addInitScript((t: Theme) => {
        localStorage.clear();
        localStorage.setItem(
          'weblogcat:tweaks:v1',
          JSON.stringify({ theme: t, accent: 'indigo', performanceMode: 'on' }),
        );
      }, theme);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: /no device connected/i }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: out(theme, 'empty-state'), fullPage: false });
    });

    test('connect dropdown menu', async ({ page }) => {
      // `?wdp=1` reveals the split-button arrow; the screenshot captures
      // both transports in the menu (WebUSB + Web Device Proxy with the
      // experimental badge). No fake daemon needed — we capture the
      // menu, not the proxy dialog.
      await page.addInitScript((t: Theme) => {
        localStorage.clear();
        localStorage.setItem(
          'weblogcat:tweaks:v1',
          JSON.stringify({ theme: t, accent: 'indigo', performanceMode: 'on' }),
        );
      }, theme);
      await page.goto('/?wdp=1');
      await page.getByRole('button', { name: /choose connection method/i }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.screenshot({
        path: out(theme, 'connect-dropdown'),
        fullPage: false,
      });
    });

    test('wdp dialog (daemon not detected)', async ({ page }) => {
      // CI has no WDP daemon, so the dialog naturally reaches the
      // "Daemon not detected" empty state with the Install CTA — which
      // is exactly the shot worth shipping in the docs.
      await page.addInitScript((t: Theme) => {
        localStorage.clear();
        localStorage.setItem(
          'weblogcat:tweaks:v1',
          JSON.stringify({ theme: t, accent: 'indigo', performanceMode: 'on' }),
        );
      }, theme);
      await page.goto('/?wdp=1');
      await page.getByRole('button', { name: /choose connection method/i }).click();
      await page.getByRole('menuitem', { name: /Connect via Web Device Proxy/i }).click();
      const dialog = page.getByRole('dialog', { name: /Connect via Web Device Proxy/i });
      await expect(dialog).toContainText(/Daemon not detected/i);
      await page.screenshot({
        path: out(theme, 'wdp-dialog'),
        fullPage: false,
      });
    });

    test('simulator landing', async ({ page }) => {
      await bootSimulator(page, theme);
      await page.screenshot({
        path: out(theme, 'simulator-empty'),
        fullPage: false,
      });
    });

    test('topbar', async ({ page }) => {
      await bootSimulator(page, theme);
      const topbar = page.locator('.dash-top');
      await topbar.screenshot({ path: out(theme, 'topbar') });
    });

    test('dashboard default layout', async ({ page }) => {
      await bootSimulator(page, theme);
      await page.screenshot({
        path: out(theme, 'dashboard-default'),
        fullPage: false,
      });
    });

    // Per-widget shots. Each follows the same pattern: boot the
    // simulator, drive the widget to a representative state, wait
    // on a DOM signal that proves the state arrived, then snapshot
    // the tile.

    test('logcat tile (default)', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = page
        .locator('.tile')
        .filter({ has: page.locator('.lc-widget') });
      await tile.screenshot({ path: out(theme, 'logcat-default') });
    });

    test('logcat tile with chips', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = page
        .locator('.tile')
        .filter({ has: page.locator('.lc-widget') });
      const input = tile.locator('.fb-input');
      await input.focus();
      await input.fill('tag:Activity');
      await input.press('Enter');
      await expect(tile.locator('.chip')).toHaveCount(1);
      await tile.screenshot({ path: out(theme, 'logcat-chips') });
    });

    test('logcat pinned row', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = page
        .locator('.tile')
        .filter({ has: page.locator('.lc-widget') });
      const firstRow = tile.locator('.row').first();
      await firstRow.hover();
      const pin = firstRow
        .locator('button[aria-label*="Pin"], .row-pin')
        .first();
      if (await pin.count()) {
        await pin.click({ force: true });
      }
      await tile.screenshot({ path: out(theme, 'logcat-pinned') });
    });

    test('shell tile', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = await addWidget(page, /Shell/, '.sh-widget');
      const input = tile.locator('input[aria-label="Shell input"]');
      await input.focus();
      await input.fill('pwd');
      await input.press('Enter');
      await expect(tile).toContainText('/sdcard');
      await input.fill('help');
      await input.press('Enter');
      await tile.screenshot({ path: out(theme, 'shell-default') });
    });

    test('dumpsys tile', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = await addWidget(page, /Dumpsys/, '.ds-widget');
      await expect(tile.locator('.ds-card-head').first()).toContainText(
        /charge/i,
      );
      await tile.screenshot({ path: out(theme, 'dumpsys-default') });
    });

    test('files tile', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = await addWidget(page, /Files/, '.fx-widget');
      await expect(tile.locator('.fx-crumb.current')).toContainText('Download');
      await tile.screenshot({ path: out(theme, 'files-default') });
    });

    test('mirror tile', async ({ page }) => {
      await bootSimulator(page, theme);
      const tile = await addWidget(page, /Screen Mirror/, '.mr-widget');
      await expect(tile.locator('.mirror-svg')).toBeVisible();
      await tile.screenshot({ path: out(theme, 'mirror-default') });
    });
  });
}

// ---- Hero shot --------------------------------------------------------------
//
// README + docs hero composition. Deterministic four-widget layout
// (Mirror left, Logcat top-right, Shell + Dumpsys bottom-right) with
// the indigo accent and compact mode. Seeded via localStorage so the
// composition is bit-stable. Captures both a dark variant
// (docs/public/screenshot.png — README + docs hero) and a light
// variant (docs/public/screenshot-light.png — VitePress's
// `image.light` swap).

test.describe('hero shots', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`hero shot (${theme})`, async ({ page }) => {
      await page.addInitScript((themeArg: Theme) => {
        localStorage.clear();
        localStorage.setItem(
          'weblogcat:tweaks:v1',
          JSON.stringify({
            theme: themeArg,
            accent: 'indigo',
            compactMode: true,
            performanceMode: 'on',
          }),
        );
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
      }, theme);

      await page.goto('/');
      await page.getByRole('button', { name: /fake data/i }).click();
      await expect(page.locator('.tile')).toHaveCount(4);
      await expect(page.locator('.lc-widget')).toBeVisible();
      await expect(page.locator('.mr-widget')).toBeVisible();
      await expect(page.locator('.sh-widget')).toBeVisible();
      await expect(page.locator('.ds-widget')).toBeVisible();
      await expect(page.locator('.row').first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page
          .locator('.tile')
          .filter({ has: page.locator('.ds-widget') })
          .locator('.ds-card-head')
          .first(),
      ).toContainText(/charge/i);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: 5_000 });
      await page.addStyleTag({
        content: '.fake-badge,.toast{display:none!important}',
      });
      const heroPath = theme === 'dark' ? HERO_PATH : HERO_LIGHT_PATH;
      await page.screenshot({ path: heroPath, fullPage: false });
    });
  }
});
