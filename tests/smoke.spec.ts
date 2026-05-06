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
    // The decorative SVG bezel was removed in the UI-tweaks pass; the
    // simulated app frame now fills the tile body edge-to-edge.
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

  // === Phase 10 polish: tile chrome interactions =========================
  // The default layout has 4 tiles arranged via a binary-tree (dwindle)
  // layout: Mirror on the left of a row split, with Logcat / Shell /
  // Dumpsys laid out in the right pane.

  test('dragging a tile by the grip onto another tile swaps them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(4);

    // Capture each tile's kind by id before the swap. The Mirror tile
    // sits at index 0 and the Logcat tile at index 1 in the default
    // layout, so swapping them flips the order.
    const before0 = await page.locator('.tile').nth(0).getAttribute('data-tile-id');
    const before1 = await page.locator('.tile').nth(1).getAttribute('data-tile-id');
    expect(before0).toBeTruthy();
    expect(before1).toBeTruthy();

    const fromHead = page.locator('.tile').nth(0).locator('.tile-head');
    const toHead = page.locator('.tile').nth(1).locator('.tile-head');
    const fromBox = await fromHead.boundingBox();
    const toBox = await toHead.boundingBox();
    if (!fromBox || !toBox) throw new Error('header bounding boxes missing');

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    // Walk the cursor in steps so the swap-drag activation threshold trips.
    await page.mouse.move(
      toBox.x + toBox.width / 2,
      toBox.y + toBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    const after0 = await page.locator('.tile').nth(0).getAttribute('data-tile-id');
    const after1 = await page.locator('.tile').nth(1).getAttribute('data-tile-id');
    expect(after0).toBe(before1);
    expect(after1).toBe(before0);
  });

  test('dragging the seam between two tiles resizes them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    // Capture the Mirror tile width before; the outer-most seam controls
    // its share of the dashboard.
    const mirrorTile = page.locator('.tile').nth(0);
    const before = await mirrorTile.boundingBox();
    if (!before) throw new Error('mirror tile has no bounding box');

    const handle = page.locator('.dash-split-handle.row').first();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error('split handle has no bounding box');

    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 120,
      handleBox.y + handleBox.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();

    const after = await mirrorTile.boundingBox();
    if (!after) throw new Error('resized mirror tile has no bounding box');
    expect(after.width).toBeGreaterThan(before.width);
  });

  test('the eye toggle hides the widget bar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    const logcatTile = page.locator('.tile').nth(1);
    await expect(logcatTile.locator('.filter-bar')).toBeVisible();

    await logcatTile.getByRole('button', { name: /hide widget bar/i }).click();
    await expect(logcatTile).toHaveClass(/bars-hidden/);
    await expect(logcatTile.locator('.filter-bar')).toBeHidden();

    // And toggle back.
    await logcatTile.getByRole('button', { name: /show widget bar/i }).click();
    await expect(logcatTile).not.toHaveClass(/bars-hidden/);
    await expect(logcatTile.locator('.filter-bar')).toBeVisible();
  });

  test('maximize fills the viewport; restore returns to grid', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    const logcatTile = page.locator('.tile').nth(1);
    await logcatTile.getByRole('button', { name: /maximize tile/i }).click();
    await expect(logcatTile).toHaveClass(/\bmax\b/);
    await expect(page.locator('.dash-grid')).toHaveClass(/has-max/);

    await logcatTile.getByRole('button', { name: /restore tile/i }).click();
    await expect(logcatTile).not.toHaveClass(/\bmax\b/);
    await expect(page.locator('.dash-grid')).not.toHaveClass(/has-max/);
  });

  test('Reset layout returns to the 4-tile default after adding extras', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(4);

    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Logcat' }).click();
    await expect(page.locator('.tile')).toHaveCount(5);

    await page.getByRole('button', { name: /reset layout/i }).click();
    await expect(page.locator('.tile')).toHaveCount(4);
  });

  // === Phase 11: per-widget settings modal ===============================
  // The cog button on every tile opens a per-widget settings modal whose
  // controls are backed by the same `useTileSettings` state that the on-
  // bar controls already write to. Per docs/LEARNINGS.md#10 these
  // assertions intentionally pin to the canonical 4-tile default
  // arrangement (Mirror, Logcat, Shell, Dumpsys at indexes 0..3).

  test('cog opens a per-widget settings modal on the Logcat tile', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const logcatTile = page.locator('.tile').nth(1);
    await logcatTile.getByRole('button', { name: /widget settings/i }).click();
    await expect(page.getByRole('dialog', { name: /Logcat · settings/i })).toBeVisible();
    // Esc dismisses.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Logcat · settings/i })).not.toBeVisible();
  });

  test('cog on the Shell tile shows the home directory field', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const shellTile = page.locator('.tile').nth(2);
    await shellTile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /Shell · settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/home directory/i)).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('cog on the Dumpsys tile shows the default-preset segmented control', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const dsTile = page.locator('.tile').nth(3);
    await dsTile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /Dumpsys · settings/i });
    await expect(dialog).toBeVisible();
    // Two segmented controls expected (preset + view) plus the slider.
    await expect(dialog.locator('.ws-seg').first()).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).click();
  });

  test('cog on the Mirror tile shows the overlay font-size slider', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const mirrorTile = page.locator('.tile').nth(0);
    await mirrorTile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /Screen Mirror · settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input[type="range"]')).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).click();
  });

  test('Files tile cog opens a settings modal with the starting-path field', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // Files isn't in the default layout — palette adds it.
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Files' }).click();
    await expect(page.locator('.tile')).toHaveCount(5);
    const fxTile = page.locator('.tile').nth(4);
    await fxTile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /Files · settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/starting path/i)).toBeVisible();
  });

  test('Logcat modal "Wrap" toggle and on-bar wrap button stay in sync', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    const logcatTile = page.locator('.tile').nth(1);
    // Open the modal.
    await logcatTile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /Logcat · settings/i });
    await expect(dialog).toBeVisible();

    const modalWrap = dialog.getByRole('switch', { name: /^Wrap$/ });
    await expect(modalWrap).toHaveAttribute('aria-checked', 'false');

    // Flip via the modal — the on-bar wrap button should reflect it.
    await modalWrap.click();
    await expect(modalWrap).toHaveAttribute('aria-checked', 'true');

    // Close the modal so we can interact with the bar button.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    const barWrap = logcatTile.locator('button.tb-mini').filter({ hasText: 'wrap' });
    await expect(barWrap).toHaveClass(/active/);

    // Toggle from the bar — re-open the modal and confirm the switch flipped back.
    await barWrap.click();
    await logcatTile.getByRole('button', { name: /widget settings/i }).click();
    await expect(page.getByRole('dialog', { name: /Logcat · settings/i })).toBeVisible();
    await expect(
      page
        .getByRole('dialog', { name: /Logcat · settings/i })
        .getByRole('switch', { name: /^Wrap$/ }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('the +Add palette closes via Esc, scrim click, and the close button', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    // Esc closes.
    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(page.getByRole('dialog', { name: /add widget/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /add widget/i })).not.toBeVisible();

    // Scrim click closes. The dialog sits centered on top of the
    // backdrop, so click a corner of the scrim explicitly — clicking
    // the centre would land on a palette card.
    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(page.getByRole('dialog', { name: /add widget/i })).toBeVisible();
    await page.locator('.palette-back').click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog', { name: /add widget/i })).not.toBeVisible();

    // Close button (×) closes.
    await page.getByRole('button', { name: /add widget/i }).click();
    const dialog = page.getByRole('dialog', { name: /add widget/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
