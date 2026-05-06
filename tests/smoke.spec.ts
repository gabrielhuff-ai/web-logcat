// Headless smoke tests for the simulated-data path. The real WebUSB
// flow (`Connect a device`) requires hardware and Chromium's USB
// permissions — out of scope for CI; covered by manual testing on the
// deployed staging URL.
//
// v2 update: the connected app is now `<Dashboard/>` (topbar +
// `<TileGrid/>` of widgets) instead of the v1 single-purpose toolbar.
// Selectors below target the v2 chrome (`.dash-top`,
// `.dash-brand-name`, `.dash-device`) plus per-widget bits inside the
// default Logcat tile.

import { test, expect } from '@playwright/test';

test.describe('empty state', () => {
  test('renders the connect-or-fake-data card', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /no device connected/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /connect a device/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /fake data/i })).toBeVisible();
  });
});

test.describe('simulator', () => {
  test('clicking "fake data" swaps in the dashboard and starts streaming', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    // Dashboard topbar appears with the brand wordmark.
    await expect(page.locator('.dash-brand-name')).toHaveText('WebLogcat');

    // Device pill shows the simulated device.
    await expect(page.locator('.dash-device-name')).toContainText('Demo Device');

    // The Phase 9 default layout ships the full HANDOFF arrangement:
    // Mirror + Logcat + Shell + Dumpsys (the last is a stub until
    // Phase 7 lands). Logs land in the Logcat list.
    await expect(page.locator('.tile')).toHaveCount(4);
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('filter bar', () => {
  test('focusing the empty input shows the discoverable filter types', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.locator('.fb-input').focus();

    // The "FILTER BY — pick a type or just type to highlight" header
    // identifies the autocomplete dropdown. All five filter types
    // should appear as starter suggestions.
    await expect(page.locator('.fb-ac-head')).toBeVisible();
    for (const t of ['process:', 'tag:', 'pid:', 'level:', 'message:']) {
      await expect(
        page.locator('.fb-ac-item').filter({ hasText: t }).first(),
      ).toBeVisible();
    }
  });

  test('typing a filter produces a chip', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('tag:Activity');
    await input.press('Enter');

    await expect(page.locator('.chip')).toHaveCount(1);
    await expect(page.locator('.chip')).toContainText('Activity');
  });
});

test.describe('keyboard shortcuts', () => {
  test('? opens the help dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: /keyboard shortcuts/i }),
    ).not.toBeVisible();
  });
});

test.describe('dashboard', () => {
  test('+ Add widget opens the palette with disabled non-shipped cards', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(4);

    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(page.getByRole('dialog', { name: /add widget/i })).toBeVisible();

    // After Phases 7+8+9 all five widget kinds ship; the Mirror card is
    // blocked at the palette because the default layout already includes
    // a Mirror tile (`maxInstances: 1`).
    const cards = page.locator('.palette-card');
    await expect(cards).toHaveCount(5);
    await expect(cards.filter({ hasText: 'Logcat' })).not.toBeDisabled();
    await expect(cards.filter({ hasText: 'Shell' })).not.toBeDisabled();
    await expect(cards.filter({ hasText: 'Dumpsys' })).not.toBeDisabled();
    await expect(cards.filter({ hasText: 'Files' })).not.toBeDisabled();
    await expect(cards.filter({ hasText: 'Screen Mirror' })).toBeDisabled();
  });

  test('Dumpsys tile runs a preset against the simulator', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // The default HANDOFF layout already includes a Dumpsys tile.
    await expect(page.locator('.tile')).toHaveCount(4);

    const dsTile = page.locator('.ds-widget').first();
    await expect(dsTile).toBeVisible();
    // Default preset (Battery) should resolve via the captured fixture
    // and the Charge card renders.
    await expect(dsTile.locator('.ds-card-head').first()).toContainText(/charge/i);

    // Switch to Wi-Fi and confirm the SSID from the fixture appears.
    await dsTile.locator('.ds-pill').filter({ hasText: 'Wi-Fi' }).click();
    await expect(dsTile).toContainText('HomeWifi-5G');

    // Raw view shows the captured monospace dump.
    await dsTile.locator('.ds-view-seg button').filter({ hasText: 'Raw' }).click();
    await expect(dsTile.locator('.ds-raw')).toContainText(/ConnectedSSID/);
  });

  test('adding a Files widget renders the toolbar + sdcard tree', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // Files isn't in the HANDOFF default layout — palette adds tile #5.
    await expect(page.locator('.tile')).toHaveCount(4);

    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Files' }).click();
    await expect(page.locator('.tile')).toHaveCount(5);

    const fxTile = page.locator('.fx-widget').first();
    await expect(fxTile).toBeVisible();
    // Toolbar carries the breadcrumb pointing at the canned default
    // path (`/sdcard/Download`) — confirms the simulator list resolved.
    await expect(fxTile.locator('.fx-crumb.current')).toContainText('Download');
    // Files row renders for one of the canned simulator entries.
    await expect(fxTile.locator('.fx-row').filter({ hasText: 'invoice-202411.pdf' })).toBeVisible();
  });

  test('adding a Logcat widget yields an extra tile with independent filters', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(4);

    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Logcat' }).click();
    await expect(page.locator('.tile')).toHaveCount(5);

    // Add a filter to the first Logcat tile (which sits at index 1 in
    // the HANDOFF default — Mirror at 0, Logcat at 1, Shell at 2,
    // Dumpsys at 3, new Logcat at 4).
    const firstLogcat = page.locator('.tile').nth(1);
    await firstLogcat.locator('.fb-input').focus();
    await firstLogcat.locator('.fb-input').fill('tag:Activity');
    await firstLogcat.locator('.fb-input').press('Enter');
    await expect(firstLogcat.locator('.chip')).toHaveCount(1);

    const newTile = page.locator('.tile').nth(4);
    await expect(newTile.locator('.chip')).toHaveCount(0);
  });

  test('Mirror tile renders the simulated app frame and is capped at one', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    // The default layout already includes a Mirror tile.
    await expect(page.locator('.mr-widget')).toHaveCount(1);
    await expect(page.locator('.mr-bezel')).toBeVisible();
    await expect(page.locator('.mirror-svg')).toBeVisible();

    // The three button groups + 8 hardware buttons all rendered.
    await expect(page.locator('.mr-hw')).toHaveCount(8);
    await expect(page.locator('.mr-sep')).toHaveCount(2);

    // maxInstances: 1 should keep the palette card disabled while a
    // Mirror tile already exists.
    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(
      page.locator('.palette-card').filter({ hasText: 'Screen Mirror' }),
    ).toBeDisabled();
  });

  test('adding a Shell widget runs the simulator commands', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // Default layout already includes a Shell tile.
    const shellTile = page.locator('.sh-widget').first();
    await expect(shellTile).toBeVisible();

    const input = shellTile.locator('input[aria-label="Shell input"]');
    await input.focus();
    await input.fill('pwd');
    await input.press('Enter');
    await expect(shellTile).toContainText('/sdcard');

    await input.fill('help');
    await input.press('Enter');
    await expect(shellTile).toContainText(/Built-in commands/);

    // Ctrl+L clears the scrollback — the only remaining lines come
    // from the still-mounted live prompt.
    await input.press('Control+l');
    await expect(shellTile.locator('.sh-line')).toHaveCount(1);
  });
});
