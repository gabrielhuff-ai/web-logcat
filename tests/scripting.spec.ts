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
    // Help links to the docs.
    await expect(dialog.getByRole('link', { name: /help/i })).toHaveAttribute(
      'href',
      /docs\/features\/scripting/,
    );
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

  test('a toggle set to run-on-change runs its function when flipped', async ({ page }) => {
    const panel = {
      script: 'notify() {\n  echo "flipped $NOTIFY"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'tg', kind: 'toggle', label: 'Notify', defaultValue: false, onChange: 'run', bindOutputTo: 'console' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([serial, tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${serial}:${tileId}:scripting`, JSON.stringify(p));
      },
      [FAKE_SERIAL, 't_tg', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    // Flipping the toggle runs notify() with NOTIFY=1 (no button needed).
    await tile.getByRole('switch', { name: 'Notify' }).click();
    await expect(tile.locator('.sc-console-body')).toContainText('flipped 1');
  });

  test('building a panel in the builder applies live to the widget', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page
      .locator('.palette-card')
      .filter({ has: page.locator('.palette-card-title', { hasText: 'Scripting' }) })
      .click();

    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /scripting settings/i });
    await expect(dialog).toBeVisible();

    // Write a function, add an action button + a console — all applied live.
    await dialog.getByLabel('Shell script').fill('action() {\n  echo "it worked"\n}\n');
    await dialog.getByRole('button', { name: /^add$/i }).click();
    await dialog.locator('.bdr-add-item').filter({ hasText: 'Action button' }).click();
    await dialog.getByRole('button', { name: /^add$/i }).click();
    await dialog.locator('.bdr-add-item').filter({ hasText: 'Console' }).click();

    // No Save button — closing keeps the live edits.
    await dialog.getByRole('button', { name: /^close$/i }).click();
    await expect(dialog).not.toBeVisible();
    const action = tile.locator('.sc-btn').filter({ hasText: 'Action' });
    await expect(action).toBeVisible();
    await action.click();
    await expect(tile.locator('.sc-console-body')).toContainText('it worked');
  });

  test('the builder Clear button resets the panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page
      .locator('.palette-card')
      .filter({ has: page.locator('.palette-card-title', { hasText: 'Scripting' }) })
      .click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /^example$/i }).click();
    await expect(tile.locator('.sc-btn').filter({ hasText: 'Force stop' })).toBeVisible();

    await tile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /scripting settings/i });
    await expect(dialog.locator('.bdr-ctrl-row').first()).toBeVisible();

    await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(dialog.locator('.bdr-ctrl-row')).toHaveCount(0);
    await dialog.getByRole('button', { name: /^close$/i }).click();
    // Back to the empty state — no controls remain.
    await expect(tile.getByRole('heading', { name: /build your control panel/i })).toBeVisible();
  });

  test('the empty-state "example" link loads a ready-made panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Scripting' }).click();

    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /^example$/i }).click();

    // The example panel renders its controls.
    await expect(tile.locator('.sc-btn').filter({ hasText: 'Force stop' })).toBeVisible();
    await expect(tile.locator('.sc-text')).toContainText('Package');
  });

  test('a confirm-before-run button prompts via a centred modal before running', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page
      .locator('.palette-card')
      .filter({ has: page.locator('.palette-card-title', { hasText: 'Scripting' }) })
      .click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /^example$/i }).click();

    // "Clear data" is a confirm-before-run button.
    await tile.locator('.sc-btn').filter({ hasText: 'Clear data' }).click();
    const dialog = page.locator('.sc-confirm-pop');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Run Clear data\?/i);

    await dialog.getByRole('button', { name: /^run$/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tile.locator('.sc-console-body')).toContainText('clear_data');
  });

  test('the builder controls pane collapses and re-expands', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Scripting' }).click();

    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /scripting settings/i });

    await expect(dialog.locator('.bdr-right')).toBeVisible();
    await dialog.getByRole('button', { name: /collapse controls pane/i }).click();
    await expect(dialog.locator('.bdr-right')).toHaveCount(0);
    const expandBar = dialog.getByRole('button', { name: /expand controls pane/i });
    await expect(expandBar).toBeVisible();
    await expandBar.click();
    await expect(dialog.locator('.bdr-right')).toBeVisible();
  });
});
