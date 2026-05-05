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

    // The default Logcat tile is rendered and logs land in the list.
    await expect(page.locator('.tile')).toHaveCount(1);
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
  test('+ Add widget opens the palette with disabled non-Logcat cards', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);

    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(page.getByRole('dialog', { name: /add widget/i })).toBeVisible();

    // Logcat is enabled in Phase 5; the others are disabled stubs.
    const cards = page.locator('.palette-card');
    await expect(cards).toHaveCount(5);
    await expect(cards.filter({ hasText: 'Logcat' })).not.toBeDisabled();
    await expect(cards.filter({ hasText: 'Shell' })).toBeDisabled();
    await expect(cards.filter({ hasText: 'Dumpsys' })).toBeDisabled();
    await expect(cards.filter({ hasText: 'Files' })).toBeDisabled();
    await expect(cards.filter({ hasText: 'Screen Mirror' })).toBeDisabled();
  });

  test('adding a Logcat widget yields a second tile with independent filters', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);

    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Logcat' }).click();
    await expect(page.locator('.tile')).toHaveCount(2);

    // Add a filter to the first tile only; the second tile's chip bar
    // should stay empty.
    const firstTile = page.locator('.tile').first();
    await firstTile.locator('.fb-input').focus();
    await firstTile.locator('.fb-input').fill('tag:Activity');
    await firstTile.locator('.fb-input').press('Enter');
    await expect(firstTile.locator('.chip')).toHaveCount(1);

    const secondTile = page.locator('.tile').nth(1);
    await expect(secondTile.locator('.chip')).toHaveCount(0);
  });
});
