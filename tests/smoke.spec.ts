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

// CI runs `workers: 1` and `fullyParallel: true` shares the same browser
// context across tests in a worker, which means localStorage carries
// over from one test to the next. The first test in a worker run
// would write a layout; the next test's `page.goto('/')` would
// rehydrate that layout and the assertions about "default = single
// Logcat tile" or "addWidget brings count from 1 to 2" would fail
// non-deterministically depending on file order. Clear localStorage
// on every navigation so each test starts from the empty default.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* SecurityError in some sandbox configs — ignore */
    }
  });
});

/**
 * Add a widget via the topbar palette. Returns a locator scoped to the
 * `.tile` containing that widget kind's root element. Tests prefer this
 * helper over `.tile.nth(N)` because the dwindle layout doesn't pin
 * widgets to fixed indices — the new dashboard default is a single
 * Logcat tile. Types are inferred from `@playwright/test`.
 */
async function addWidget(page, label, widgetClass) {
  const before = await page.locator(widgetClass).count();
  await page.getByRole('button', { name: /add widget/i }).click();
  await page.locator('.palette-card').filter({ hasText: label }).click();
  await expect(page.locator(widgetClass)).toHaveCount(before + 1);
  return page.locator('.tile').filter({ has: page.locator(widgetClass) }).last();
}

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

    // The new default layout is a single Logcat tile filling the
    // dashboard; logs stream into its list.
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.lc-widget')).toBeVisible();
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
  test('+ Add widget opens the palette with all five cards enabled', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);

    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(page.getByRole('dialog', { name: /add widget/i })).toBeVisible();

    const cards = page.locator('.palette-card');
    await expect(cards).toHaveCount(5);
    for (const name of ['Logcat', 'Shell', 'Dumpsys', 'Files', 'Screen Mirror']) {
      await expect(cards.filter({ hasText: name })).not.toBeDisabled();
    }
  });

  test('Dumpsys tile runs a preset against the simulator', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const dsTile = await addWidget(page, /Dumpsys/, '.ds-widget');
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
    const fxTile = await addWidget(page, /Files/, '.fx-widget');
    // Toolbar carries the breadcrumb pointing at the canned default
    // path (`/sdcard/Download`) — confirms the simulator list resolved.
    await expect(fxTile.locator('.fx-crumb.current')).toContainText('Download');
    // Files row renders for one of the canned simulator entries.
    await expect(
      fxTile.locator('.fx-row').filter({ hasText: 'invoice-202411.pdf' }),
    ).toBeVisible();
  });

  test('adding a Logcat widget yields an extra tile with independent filters', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);
    const firstLogcat = page.locator('.tile').filter({ has: page.locator('.lc-widget') });

    // Add a filter to the original Logcat tile.
    await firstLogcat.locator('.fb-input').focus();
    await firstLogcat.locator('.fb-input').fill('tag:Activity');
    await firstLogcat.locator('.fb-input').press('Enter');
    await expect(firstLogcat.locator('.chip')).toHaveCount(1);

    // Add a second Logcat — its chip bar should be empty (per-tile state).
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Logcat' }).click();
    await expect(page.locator('.tile')).toHaveCount(2);

    const allLogcats = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    await expect(allLogcats).toHaveCount(2);
    // The new tile is the one without a chip; check there's exactly one
    // tile with 0 chips (the new one) and one with 1 chip.
    await expect(allLogcats.filter({ has: page.locator('.chip') })).toHaveCount(1);
  });

  test('Mirror tile renders the simulated app frame and is capped at one', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await addWidget(page, /Screen Mirror/, '.mr-widget');

    // Bezel area + 8 hardware buttons render; capped at 1 instance.
    await expect(page.locator('.mirror-svg')).toBeVisible();
    await expect(page.locator('.mr-hw')).toHaveCount(8);
    await expect(page.locator('.mr-sep')).toHaveCount(2);

    await page.getByRole('button', { name: /add widget/i }).click();
    await expect(
      page.locator('.palette-card').filter({ hasText: 'Screen Mirror' }),
    ).toBeDisabled();
  });

  test('adding a Shell widget runs the simulator commands', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const shellTile = await addWidget(page, /Shell/, '.sh-widget');

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

  // === Tile chrome interactions ==========================================

  test('dragging a tile by the grip onto another tile swaps them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // Default = single Logcat. Add a Shell so we have two tiles to swap.
    await addWidget(page, /Shell/, '.sh-widget');
    await expect(page.locator('.tile')).toHaveCount(2);

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
    await addWidget(page, /Shell/, '.sh-widget');

    const firstTile = page.locator('.tile').nth(0);
    const before = await firstTile.boundingBox();
    if (!before) throw new Error('tile has no bounding box');

    const handle = page.locator('.dash-split-handle--row').first();
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

    const after = await firstTile.boundingBox();
    if (!after) throw new Error('resized tile has no bounding box');
    expect(after.width).toBeGreaterThan(before.width);
  });

  test('the eye toggle cycles bar mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    const logcatTile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    await expect(logcatTile.locator('.filter-bar')).toBeVisible();

    // 1st click: show → hideBars (filter bar collapses).
    await logcatTile.getByRole('button', { name: /^hide bar$/i }).click();
    await expect(logcatTile).toHaveClass(/bars-hidden/);
    await expect(logcatTile.locator('.filter-bar')).toBeHidden();

    // 2nd click: hideBars → hideHead (tile head collapses too).
    await logcatTile.getByRole('button', { name: /^hide chrome$/i }).click();
    await expect(logcatTile).toHaveClass(/head-hidden/);

    // 3rd click: hideHead → show (everything visible again).
    // The eye button lives inside `.tile-head`, which collapses to
    // height 0 in head-hidden mode and only expands on hover via
    // `:has(.tile-reveal:hover)`. Combined with the new
    // `.just-toggled` suppression after the previous click, the
    // hover-reveal race makes Playwright's pointer-based click
    // unreliable here (it keeps resolving to the higher-z-index
    // `.tile-reveal` strip). Dispatching the click via the DOM API
    // sidesteps the actionability checks entirely — same idiom we
    // already use for the wrap-toggle test below.
    await logcatTile
      .getByRole('button', { name: /^show bar$/i })
      .evaluate((el) => {
        if (el instanceof HTMLButtonElement) el.click();
      });
    await expect(logcatTile).not.toHaveClass(/bars-hidden/);
    await expect(logcatTile).not.toHaveClass(/head-hidden/);
    await expect(logcatTile.locator('.filter-bar')).toBeVisible();
  });

  test('maximize fills the viewport; restore returns to grid', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    const logcatTile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    await logcatTile.getByRole('button', { name: /maximize tile/i }).click();
    await expect(logcatTile).toHaveClass(/\bmax\b/);
    await expect(page.locator('.dash-grid')).toHaveClass(/has-max/);

    await logcatTile.getByRole('button', { name: /restore tile/i }).click();
    await expect(logcatTile).not.toHaveClass(/\bmax\b/);
    await expect(page.locator('.dash-grid')).not.toHaveClass(/has-max/);
  });

  test('Clear layout empties the dashboard to the empty state', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await addWidget(page, /Shell/, '.sh-widget');
    await expect(page.locator('.tile')).toHaveCount(2);

    await page.getByRole('button', { name: /clear layout/i }).click();
    await expect(page.locator('.tile')).toHaveCount(0);
    await expect(page.locator('.dash-empty')).toBeVisible();
  });

  test('Cmd+Z undoes a widget addition; Cmd+Shift+Z redoes it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.tile')).toHaveCount(1);
    await addWidget(page, /Shell/, '.sh-widget');
    await expect(page.locator('.tile')).toHaveCount(2);

    await page.keyboard.press('Meta+z');
    await expect(page.locator('.tile')).toHaveCount(1);
    await expect(page.locator('.sh-widget')).toHaveCount(0);

    await page.keyboard.press('Meta+Shift+z');
    await expect(page.locator('.tile')).toHaveCount(2);
    await expect(page.locator('.sh-widget')).toHaveCount(1);
  });

  // === Per-widget settings modal =========================================

  test('cog opens a per-widget settings modal on the Logcat tile', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const logcatTile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    await logcatTile.getByRole('button', { name: /widget settings/i }).click();
    await expect(page.getByRole('dialog', { name: /Logcat · settings/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Logcat · settings/i })).not.toBeVisible();
  });

  test('cog on the Shell tile shows the home directory field', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const shellTile = await addWidget(page, /Shell/, '.sh-widget');
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
    const dsTile = await addWidget(page, /Dumpsys/, '.ds-widget');
    await dsTile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /Dumpsys · settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.ws-seg').first()).toBeVisible();
    await dialog.getByRole('button', { name: /close/i }).click();
  });

  test('cog on the Mirror tile shows the overlay font-size slider', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const mirrorTile = await addWidget(page, /Screen Mirror/, '.mr-widget');
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
    const fxTile = await addWidget(page, /Files/, '.fx-widget');
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

    const logcatTile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
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
    // Use a direct DOM click rather than Playwright's mouse simulation: the
    // FilterBar's tooltip pseudo-element (`.tt::after`) appears on hover and
    // can race with the click in the dwindle layout where the bar sits a
    // few pixels from a split seam. The DOM-level click fires React's
    // onClick deterministically.
    await barWrap.evaluate((el) => {
      if (el instanceof HTMLButtonElement) el.click();
    });
    // Wait for the on-bar state to reflect the toggle before reopening the
    // modal, so the modal hydrates from the just-written localStorage entry.
    await expect(barWrap).not.toHaveClass(/active/);
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

  test('global settings cog opens the dialog with performance + stream-speed controls', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();

    await page.getByRole('button', { name: /global settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /global settings/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Performance mode/i);
    await expect(dialog).toContainText(/Simulated stream speed/i);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});
