// Scripting widget — simulator-path e2e.
//
// Covers the test-sync checklist for a new widget: it appears in the palette
// and is enabled; adding it spawns exactly one tile; and the canonical
// happy-path interaction (press an action button, see its function's output in
// the console) works against the simulator. A pre-seeded panel exercises the
// run path without driving the whole builder UI; a separate test confirms the
// builder opens and the empty state renders.

import { test, expect } from '@playwright/test';

const FAKE_SERIAL = 'fake-device-001';
const TILE_ID = 't_scr';

// A ready-made "greet" panel: a Name input ($NAME), a Greet button (greet()),
// and a console. The simulator evaluates `echo "hello $NAME"` with NAME=world.
const PANEL = {
  script: 'greet() {\n  echo "hello $NAME"\n}\n',
  runAsRoot: false,
  fontSize: 12,
  controls: [
    { id: 'in1', kind: 'text', label: 'Name', defaultValue: 'world', onChange: 'none' },
    { id: 'btn1', kind: 'button', label: 'Greet', variant: 'default', confirm: false, bindOutputTo: 'console' },
    { id: 'con1', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
  ],
};

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

test.describe('scripting widget', () => {
  test('appears in the palette, enabled, and adds a single tile', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);

    await page.getByRole('button', { name: /add widget/i }).click();
    const card = page.locator('.palette-card').filter({ hasText: 'Scripting' });
    await expect(card).toBeVisible();
    await expect(card).not.toBeDisabled();
    await card.click();

    await expect(page.locator('.sw-body')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /build your control panel/i })).toBeVisible();
  });

  test('the empty-state CTA and the cog both open the builder', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Scripting' }).click();

    // Empty-state CTA opens the builder.
    await page.getByRole('button', { name: /open settings to build/i }).click();
    const dialog = page.getByRole('dialog', { name: /scripting settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Shell script')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // The tile cog reopens it.
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /widget settings/i }).click();
    await expect(dialog).toBeVisible();
  });

  test('pressing an action button runs its function and shows output in the console', async ({
    page,
  }) => {
    await page.addInitScript(
      ([serial, tileId, panel]) => {
        const layout = {
          tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
          tree: { type: 'leaf', id: tileId },
          focusId: tileId,
        };
        localStorage.setItem('weblogcat-dashboard-v2', JSON.stringify(layout));
        localStorage.setItem(
          `weblogcat:settings:${serial}:${tileId}:scripting`,
          JSON.stringify(panel),
        );
      },
      [FAKE_SERIAL, TILE_ID, PANEL],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    // The seeded panel renders its Greet button + console.
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await expect(tile).toHaveCount(1);
    const greet = tile.locator('.sc-btn').filter({ hasText: 'Greet' });
    await expect(greet).toBeVisible();

    // Run it — the simulator echoes "hello $NAME" with NAME=world.
    await greet.click();
    await expect(tile.locator('.sc-console-body')).toContainText('hello world');
    await expect(tile.locator('.sc-exit')).toContainText(/exit 0/);
  });
});
