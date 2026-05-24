// Dashboard import/export — simulator-path e2e.
//
// Covers the staging feedback: importing applies live (no reload → no bounce
// back to the connect screen), and a dashboard carrying scripting panels gates
// import behind the acknowledgement checkbox.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('weblogcat:tweaks:v1', JSON.stringify({ performanceMode: 'on' }));
    } catch {
      /* ignore */
    }
  });
});

async function copyExport(page, dialog) {
  await dialog.getByRole('button', { name: /copy text/i }).click();
  let encoded = '';
  await expect
    .poll(async () => {
      encoded = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
      return encoded.length;
    })
    .toBeGreaterThan(10);
  return encoded;
}

test.describe('dashboard import/export', () => {
  test('exporting then importing applies live without reconnecting', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);
    await page.getByRole('button', { name: /add widget/i }).click();
    await page
      .locator('.palette-card')
      .filter({ has: page.locator('.palette-card-title', { hasText: 'Shell' }) })
      .click();
    await expect(page.locator('.tile')).toHaveCount(2);

    // Export to the clipboard.
    await page.getByRole('button', { name: /import or export dashboard/i }).click();
    const dialog = page.getByRole('dialog', { name: /import or export dashboard/i });
    await expect(dialog).toBeVisible();
    const encoded = await copyExport(page, dialog);
    await dialog.getByRole('button', { name: /^close$/i }).click();

    // Clear the dashboard, then import it back.
    await page.getByRole('button', { name: /clear layout/i }).click();
    await expect(page.locator('.tile')).toHaveCount(0);

    await page.getByRole('button', { name: /import or export dashboard/i }).click();
    await dialog.getByPlaceholder(/paste exported dashboard/i).fill(encoded);
    await dialog.getByRole('button', { name: /import dashboard/i }).click();

    // Live apply: tiles return and the device stays connected (no reload →
    // no bounce to the connect screen).
    await expect(page.locator('.tile')).toHaveCount(2);
    await expect(page.locator('.sh-widget')).toBeVisible();
    await expect(page.locator('.dash-device-name')).toContainText('Demo Device');
    await expect(page.getByRole('heading', { name: /no device connected/i })).toHaveCount(0);
  });

  test('importing a dashboard with scripts is gated behind acknowledgement', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Scripting' }).click();
    const scTile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await scTile.getByRole('button', { name: /^example$/i }).click();
    await expect(scTile.locator('.sc-btn').filter({ hasText: 'Force stop' })).toBeVisible();

    await page.getByRole('button', { name: /import or export dashboard/i }).click();
    const dialog = page.getByRole('dialog', { name: /import or export dashboard/i });
    const encoded = await copyExport(page, dialog);
    await dialog.getByRole('button', { name: /^close$/i }).click();

    await page.getByRole('button', { name: /clear layout/i }).click();
    await expect(page.locator('.tile')).toHaveCount(0);

    await page.getByRole('button', { name: /import or export dashboard/i }).click();
    await dialog.getByPlaceholder(/paste exported dashboard/i).fill(encoded);

    // The scripts acknowledgement appears and the button is gated.
    const ack = dialog.locator('.imex-ack');
    await expect(ack).toBeVisible();
    const importBtn = dialog.getByRole('button', { name: /import dashboard/i });
    await expect(importBtn).toHaveClass(/imex-btn-disabled/);

    // Clicking while unchecked must not import. aria-disabled blocks
    // Playwright's actionability (as it should for assistive tech), but real
    // clicks still fire the shake handler — force past the check to simulate.
    await importBtn.click({ force: true });
    await expect(page.locator('.tile')).toHaveCount(0);

    // Acknowledge → import proceeds.
    await ack.locator('input[type="checkbox"]').check();
    await expect(importBtn).not.toHaveClass(/imex-btn-disabled/);
    await importBtn.click();
    await expect(page.locator('.sw-body')).toHaveCount(1);
    await expect(page.locator('.dash-device-name')).toContainText('Demo Device');
  });
});
