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

// Pre-seed every page with a clean slate + forced performance mode.
//   - localStorage.clear() — keeps each test booting from in-code
//     defaults (the dwindle layout etc.) regardless of what the
//     previous test left behind.
//   - `weblogcat:tweaks:v1` with `performanceMode: 'on'` — pins
//     `[data-perf="on"]` on the document so `.tile`'s position
//     transitions are off for bbox probes. Belt-and-braces against
//     Playwright's `reducedMotion: 'reduce'` not always reaching
//     the page's `matchMedia` (CI was reporting `dataPerf: 'off'`
//     even with the config flag set).
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

  test('connect button exposes the split-arrow dropdown', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.connect-split')).toBeVisible();
    await expect(page.getByRole('button', { name: /connect a device/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /choose connection method/i }),
    ).toBeVisible();
  });

  test('dropdown menu surfaces both transports with the experimental badge on WDP', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /choose connection method/i }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Connect via WebUSB/i })).toBeVisible();
    const proxyItem = menu.getByRole('menuitem', { name: /Connect via Web Device Proxy/i });
    await expect(proxyItem).toBeVisible();
    await expect(proxyItem).toContainText(/experimental/i);
  });

  test('WDP dialog reports "Daemon not detected" when the proxy is unreachable', async ({
    page,
  }) => {
    // No WDP daemon listening on :9167, so the tracker probe fails and
    // the dialog shows its not-installed empty state.
    await page.goto('/');
    await page.getByRole('button', { name: /choose connection method/i }).click();
    await page.getByRole('menuitem', { name: /Connect via Web Device Proxy/i }).click();
    const dialog = page.getByRole('dialog', { name: /Connect via Web Device Proxy/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Daemon not detected/i);
    // Escape closes the dialog.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Authorize on a PROXY_UNAUTHORIZED device shows an error when the popup is blocked', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const SNAPSHOT = JSON.stringify({
        version: 'fake-wdp',
        device: [
          {
            serialNumber: 'wdp-unauth-001',
            proxyStatus: 'PROXY_UNAUTHORIZED',
            adbStatus: 'AUTHORIZING',
            approveUrl: 'https://example.test/wdp-approve',
          },
        ],
      });
      function FakeWdpSocket(url) {
        this.url = url;
        this.readyState = 0;
        this.binaryType = 'arraybuffer';
        this.onopen = null;
        this._onmessage = null;
        this._buffer = [];
        this.onerror = null;
        this.onclose = null;
        Object.defineProperty(this, 'onmessage', {
          get() {
            return this._onmessage;
          },
          set(fn) {
            this._onmessage = fn;
            if (fn && this._buffer.length > 0) {
              const buf = this._buffer;
              this._buffer = [];
              for (const data of buf) fn({ data });
            }
          },
          configurable: true,
        });
        const self = this;
        setTimeout(() => {
          self.readyState = 1;
          if (self.onopen) self.onopen();
          if (url.endsWith('/track-devices-json')) {
            if (self._onmessage) self._onmessage({ data: SNAPSHOT });
            else self._buffer.push(SNAPSHOT);
          }
        }, 0);
      }
      FakeWdpSocket.prototype.send = function () {};
      FakeWdpSocket.prototype.close = function () {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      };
      window.WebSocket = function (url) {
        if (typeof url === 'string' && url.startsWith('ws://127.0.0.1:9167/')) {
          return new FakeWdpSocket(url);
        }
        return new WebSocket(url);
      };
      // Simulate the browser blocking the popup — window.open returns null.
      window.open = function () {
        return null;
      };
    });

    await page.goto('/');
    await page.getByRole('button', { name: /choose connection method/i }).click();
    await page.getByRole('menuitem', { name: /Connect via Web Device Proxy/i }).click();
    const dialog = page.getByRole('dialog', { name: /Connect via Web Device Proxy/i });
    const row = dialog.locator('.wdp-device');
    await expect(row).toContainText('PROXY_UNAUTHORIZED');
    await row.getByRole('button', { name: /authorize/i }).click();
    await expect(dialog.locator('.wdp-device-error')).toContainText(
      /Browser blocked the approve popup/i,
    );
  });

  test('Authorize triggers Connect once WDP pushes the post-approval snapshot', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const UNAUTH_SNAPSHOT = JSON.stringify({
        version: 'fake-wdp',
        device: [
          {
            serialNumber: 'wdp-flip-001',
            proxyStatus: 'PROXY_UNAUTHORIZED',
            adbStatus: 'AUTHORIZING',
            approveUrl: 'https://example.test/wdp-approve',
          },
        ],
      });
      const READY_SNAPSHOT = JSON.stringify({
        version: 'fake-wdp',
        device: [
          {
            serialNumber: 'wdp-flip-001',
            proxyStatus: 'ADB',
            adbStatus: 'DEVICE',
            adbProps: {
              'ro.product.model': 'Flip Pixel',
              'ro.product.name': 'flip',
              'ro.product.device': 'flip',
              'ro.build.version.release': '14',
            },
          },
        ],
      });
      let trackingSocket = null;
      function FakeWdpSocket(url) {
        this.url = url;
        this.readyState = 0;
        this.binaryType = 'arraybuffer';
        this.onopen = null;
        this._onmessage = null;
        this._buffer = [];
        this.onerror = null;
        this.onclose = null;
        Object.defineProperty(this, 'onmessage', {
          get() {
            return this._onmessage;
          },
          set(fn) {
            this._onmessage = fn;
            if (fn && this._buffer.length > 0) {
              const buf = this._buffer;
              this._buffer = [];
              for (const data of buf) fn({ data });
            }
          },
          configurable: true,
        });
        const self = this;
        setTimeout(() => {
          self.readyState = 1;
          if (self.onopen) self.onopen();
          if (url.endsWith('/track-devices-json')) {
            trackingSocket = self;
            if (self._onmessage) self._onmessage({ data: UNAUTH_SNAPSHOT });
            else self._buffer.push(UNAUTH_SNAPSHOT);
          }
        }, 0);
      }
      FakeWdpSocket.prototype.send = function () {};
      FakeWdpSocket.prototype.close = function () {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      };
      window.WebSocket = function (url) {
        if (typeof url === 'string' && url.startsWith('ws://127.0.0.1:9167/')) {
          return new FakeWdpSocket(url);
        }
        return new WebSocket(url);
      };
      // Fake popup: a window object whose `.closed` flips to true after
      // 80ms. When the panel detects the close, it polls for the new
      // snapshot — which we push 50ms in. The snapshot transition is
      // what gates the subsequent `onConnect` call.
      window.open = function () {
        const popup = { closed: false };
        setTimeout(() => {
          if (trackingSocket && trackingSocket._onmessage) {
            trackingSocket._onmessage({ data: READY_SNAPSHOT });
          }
        }, 50);
        setTimeout(() => {
          popup.closed = true;
        }, 80);
        return popup;
      };
    });

    await page.goto('/');
    await page.getByRole('button', { name: /choose connection method/i }).click();
    await page.getByRole('menuitem', { name: /Connect via Web Device Proxy/i }).click();
    const dialog = page.getByRole('dialog', { name: /Connect via Web Device Proxy/i });
    const row = dialog.locator('.wdp-device');
    await expect(row).toContainText('PROXY_UNAUTHORIZED');
    await row.getByRole('button', { name: /authorize/i }).click();
    // After the popup closes and the new snapshot lands, the dialog
    // forwards the now-ready device to onConnect — dashboard mounts.
    await expect(page.locator('.dash-brand-name')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.dash-device-name')).toContainText('Flip Pixel');
  });

  test('WDP dialog surfaces fake devices and connects via the proxy transport', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Inject a fake WDP daemon in-page. The constructor intercepts
      // WebSocket URLs targeting ws://127.0.0.1:9167/* and replays a
      // scripted /track-devices-json snapshot or /adb-json byte stream.
      const RealWebSocket = window.WebSocket;
      const SNAPSHOT = JSON.stringify({
        version: 'fake-wdp-0.0.1',
        device: [
          {
            serialNumber: 'wdp-fake-001',
            proxyStatus: 'ADB',
            adbStatus: 'DEVICE',
            adbProps: {
              'ro.product.model': 'Fake Pixel',
              'ro.product.name': 'fake-panther',
              'ro.product.device': 'panther',
              'ro.build.version.release': '14',
            },
          },
        ],
      });
      function FakeWdpSocket(url) {
        this.url = url;
        this.readyState = 0;
        this.binaryType = 'arraybuffer';
        this.onopen = null;
        this._onmessage = null;
        this._buffer = [];
        this.onerror = null;
        this.onclose = null;
        Object.defineProperty(this, 'onmessage', {
          get() {
            return this._onmessage;
          },
          set(fn) {
            this._onmessage = fn;
            if (fn && this._buffer.length > 0) {
              const buf = this._buffer;
              this._buffer = [];
              for (const data of buf) fn({ data });
            }
          },
          configurable: true,
        });
        const self = this;
        setTimeout(() => {
          self.readyState = 1;
          if (self.onopen) self.onopen();
          if (url.endsWith('/track-devices-json')) {
            // Buffer the snapshot until the tracker attaches onmessage.
            if (self._onmessage) self._onmessage({ data: SNAPSHOT });
            else self._buffer.push(SNAPSHOT);
          }
        }, 0);
      }
      FakeWdpSocket.prototype.send = function () {
        // For /adb-json the first text frame is the JSON header; after
        // that we'd see binary writes (e.g. shell stdin). We don't need
        // to reply — the e2e test only asserts the UI transition.
      };
      FakeWdpSocket.prototype.close = function () {
        this.readyState = 3;
        if (this.onclose) this.onclose();
      };
      window.WebSocket = function (url) {
        if (typeof url === 'string' && url.startsWith('ws://127.0.0.1:9167/')) {
          return new FakeWdpSocket(url);
        }
        return new RealWebSocket(url);
      };
    });

    await page.goto('/');
    await page.getByRole('button', { name: /choose connection method/i }).click();
    await page.getByRole('menuitem', { name: /Connect via Web Device Proxy/i }).click();
    const dialog = page.getByRole('dialog', { name: /Connect via Web Device Proxy/i });
    await expect(dialog).toBeVisible();
    const row = dialog.locator('.wdp-device');
    await expect(row).toContainText('Fake Pixel');
    await expect(row).toContainText('wdp-fake-001');

    // Clicking Connect transitions to the dashboard. The adb session
    // can't fully succeed against our minimal fake (we don't reply to
    // /adb-json shell:logcat), but the dialog should close and the
    // topbar should reflect a proxy-attached device.
    await row.getByRole('button', { name: /connect/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect(page.locator('.dash-brand-name')).toBeVisible();
    await expect(page.locator('.dash-device-name')).toContainText('Fake Pixel');
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

  test('activating a filter chip highlights the first match and ⌘G steps through', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
    // Give the stream a beat so a broadly-matching filter has matches
    // to find — keeps the test stable when run in parallel.
    await page.waitForTimeout(800);

    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('level:I');
    await input.press('Enter');

    // Click the chip to activate find-next-match navigation.
    const chip = page.locator('.chip').first();
    await chip.click();
    await expect(chip).toHaveClass(/chip-active/);

    // The first match should be highlighted and visible in the viewport.
    const activeMatch = page.locator('.row.active-match');
    await expect(activeMatch).toHaveCount(1, { timeout: 10_000 });
    await expect(activeMatch).toBeInViewport();

    // The X/Y counter should show 1/N.
    await expect(page.locator('.fb-match-counter')).toContainText(/^1\//);

    // Pause the stream so the matches don't shift mid-test.
    await page.locator('.lc-widget').focus();
    await page.keyboard.press('Space');

    // Cmd-G should advance to the next match AND keep it in view (the
    // visibility-check path handles "already on screen"; both outcomes
    // mean the active row is visible).
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+g' : 'Control+g');
    await expect(page.locator('.fb-match-counter')).toContainText(/^2\//);

    await expect(page.locator('.row.active-match')).toHaveCount(1);
    await expect(page.locator('.row.active-match')).toBeInViewport();
  });

  test('toggling "show only matches" keeps the active row at the same screen-Y', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('level:I');
    await input.press('Enter');

    // Activate the chip and pause so the buffer is stable.
    await page.locator('.chip').first().click();
    await expect(page.locator('.row.active-match')).toHaveCount(1, { timeout: 10_000 });
    await page.locator('.lc-widget').focus();
    await page.keyboard.press('Space');

    // Capture the active row's Y before the toggle.
    const yBefore = await page
      .locator('.row.active-match')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);

    // Toggle "only matches" off (it auto-enabled on first chip).
    await page
      .locator('.lc-widget [data-tt*="matches"]')
      .first()
      .click();

    // After the entries widen, the active row should still be on screen
    // at roughly the same Y (within a row's height tolerance for the
    // sub-pixel rounding inside the virtualiser).
    await expect(page.locator('.row.active-match')).toBeInViewport();
    const yAfter = await page
      .locator('.row.active-match')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(yAfter - yBefore)).toBeLessThan(40);
  });

  test('clicking a log row selects it without scrolling', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 5_000 });

    // Pause so rows don't stream away during the test.
    await page.keyboard.press('Space');

    // Click a specific row in the visible area.
    const rows = page.locator('.row');
    await rows.nth(2).click();

    // Selected rows wear the active-match class.
    await expect(page.locator('.row.active-match')).toHaveCount(1);

    // Click a different row; only one row stays active at a time.
    await rows.nth(5).click();
    await expect(page.locator('.row.active-match')).toHaveCount(1);
  });

  test('toggling "only matches" preserves the active row Y even with autoScroll on', async ({
    page,
  }) => {
    // The naive implementation lets LogList's auto-scroll-to-bottom
    // useEffect race ahead of the preserve handoff when autoScroll is
    // still true at commit time — yanking the buffer to its tail and
    // burying the selected row above the viewport.
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    // Give the stream a moment to build up so the matches filter has
    // something to keep on screen.
    await expect(page.locator('.row')).toHaveCount(10, { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(800);

    // Add a filter (auto-enables "only matches") but don't activate
    // the chip — chip activation would scroll-to-first-match and turn
    // autoScroll off, which would mask the race we're testing.
    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('level:I');
    await input.press('Enter');
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 5_000 });

    // Pause so the buffer is stable.
    await page.locator('.lc-widget').focus();
    await page.keyboard.press('Space');

    // Click a visible row to select it. Row-click doesn't touch
    // autoScroll, so it stays on if the user was tailing.
    const rows = page.locator('.row');
    await rows.nth(3).click();
    await expect(page.locator('.row.active-match')).toHaveCount(1);

    const yBefore = await page
      .locator('.row.active-match')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);

    // Toggle "only matches" off. The selected row must stay near its
    // captured Y; the auto-scroll-to-bottom must NOT win the race.
    await page
      .locator('.lc-widget [data-tt*="matches"]')
      .first()
      .click();

    await expect(page.locator('.row.active-match')).toBeInViewport();
    const yAfter = await page
      .locator('.row.active-match')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(yAfter - yBefore)).toBeLessThan(40);
  });

  test('⌘G skips the scroll when the next match is already in view', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 5_000 });

    // `level:I` matches ~30% of the simulated stream, so when the
    // chip is active the next match is essentially always within the
    // viewport — ⌘G should not move the scroll.
    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('level:I');
    await input.press('Enter');

    const chip = page.locator('.chip').first();
    await chip.click();
    await expect(page.locator('.row.active-match')).toHaveCount(1);

    // Pause to stop the stream from shifting rows mid-test.
    await page.locator('.lc-widget').focus();
    await page.keyboard.press('Space');

    const log = page.locator('.log-scroll');
    const scrollBefore = await log.evaluate((el) => el.scrollTop);

    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+g' : 'Control+g');
    await expect(page.locator('.fb-match-counter')).toContainText(/^2\//);

    const scrollAfter = await log.evaluate((el) => el.scrollTop);
    expect(scrollAfter).toBe(scrollBefore);
    await expect(page.locator('.row.active-match')).toBeInViewport();
  });

  test('switching to a different filter chip jumps to the next match after the current row', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
    // Wait for plenty of matches to accumulate so both filters have a
    // healthy stream of hits to navigate through (the assertion below
    // relies on the second filter having matches AFTER our focal row).
    await page.waitForTimeout(2500);

    // Two filters with separate match sets — `level:I` and `level:D`
    // together cover ~75% of the simulated log distribution.
    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('level:I');
    await input.press('Enter');
    await input.fill('level:D');
    await input.press('Enter');

    // Pause first so the matchCount the test reads doesn't drift
    // between the chip click and the assertions.
    await page.locator('.lc-widget').focus();
    await page.keyboard.press('Space');

    // Activate the first chip — lands on match 1/N.
    await page.locator('.chip').nth(0).click();
    await expect(page.locator('.row.active-match')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.fb-match-counter')).toContainText(/^1\//);

    // Advance a few matches inside the first filter.
    const isMac = process.platform === 'darwin';
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press(isMac ? 'Meta+g' : 'Control+g');
    }
    await expect(page.locator('.fb-match-counter')).toContainText(/^4\//);

    // Click the second chip — should jump to the next D match AFTER
    // the current row, not back to match #1 of D.
    await page.locator('.chip').nth(1).click();
    await expect(page.locator('.chip').nth(1)).toHaveClass(/chip-active/);
    await expect(page.locator('.row.active-match')).toBeInViewport();

    const counter = (await page.locator('.fb-match-counter').textContent()) ?? '';
    expect(counter).not.toBe('');
    const [pos, total] = counter.split('/').map((s) => parseInt(s, 10));
    expect(total).toBeGreaterThan(1);
    // We had 3 I-matches behind us; D is ~50% more common than I in
    // the simulator's distribution, so the next-D-after-row index
    // should comfortably exceed 1.
    expect(pos).toBeGreaterThan(1);
  });

  test('⌘F focuses the filter input (and refocuses from outside the widget)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });

    const input = page.locator('.fb-input');
    const isMac = process.platform === 'darwin';

    // Click the app brand area — focus is outside any logcat widget.
    await page.locator('.dash-brand-name, .dash-top, .lc-widget').first().click();

    // ⌘F from outside should still land on the widget's filter input.
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    await expect(input).toBeFocused();

    // Blur and re-focus inside the widget (filter the autocomplete via
    // Esc) — ⌘F again should re-focus the input.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(input).not.toBeFocused();
    await page.locator('.lc-widget').focus();
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    await expect(input).toBeFocused();
  });

  test('Esc in the filter input dismisses the autocomplete first, then blurs', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });

    const input = page.locator('.fb-input');
    await input.focus();
    await expect(page.locator('.fb-ac-head')).toBeVisible();

    // 1st Esc: dismiss menu, keep focus.
    await page.keyboard.press('Escape');
    await expect(page.locator('.fb-ac-head')).toBeHidden();
    await expect(input).toBeFocused();

    // 2nd Esc: blur.
    await page.keyboard.press('Escape');
    await expect(input).not.toBeFocused();

    // Typing after re-focus brings the menu back.
    await input.focus();
    await input.fill('t');
    await expect(page.locator('.fb-ac')).toBeVisible();
  });

  test('clicking the tile header keeps ⌘G firing in the widget (no browser find)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);

    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('level:I');
    await input.press('Enter');
    await page.locator('.chip').first().click();
    await expect(page.locator('.row.active-match')).toHaveCount(1, { timeout: 10_000 });
    await page.locator('.lc-widget').focus();
    await page.keyboard.press('Space');

    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+g' : 'Control+g');
    await expect(page.locator('.fb-match-counter')).toContainText(/^2\//);

    // Click on the tile title (the draggable header) — TileGrid blurs
    // whatever input had focus, so without the focus-recovery hook the
    // widget's keydown listener stops catching ⌘G.
    await page.locator('.tile-title').first().click();
    await page.keyboard.press(isMac ? 'Meta+g' : 'Control+g');
    await expect(page.locator('.fb-match-counter')).toContainText(/^3\//);
  });

  test('⌘G with no active chip activates the rightmost filter', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await expect(page.locator('.row').first()).toBeVisible({ timeout: 5_000 });

    const input = page.locator('.fb-input');
    await input.focus();
    await input.fill('tag:Activity');
    await input.press('Enter');
    await input.fill('level:I');
    await input.press('Enter');

    // Two chips, neither is active.
    await expect(page.locator('.chip')).toHaveCount(2);
    await expect(page.locator('.chip.chip-active')).toHaveCount(0);

    // Focus the widget so the shortcut handler picks up the key.
    await page.locator('.lc-widget').focus();
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+g' : 'Control+g');

    // The rightmost chip (level:I) should now be active and the first
    // match highlighted.
    const lastChip = page.locator('.chip').last();
    await expect(lastChip).toHaveClass(/chip-active/);
    await expect(page.locator('.row.active-match')).toHaveCount(1);
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

    // Select the two tiles by widget class rather than index — the
    // dwindle layout doesn't pin tiles to fixed DOM positions and
    // `.tile.nth(N)` was hitting transient mid-render rects in CI.
    // Filtering by `:has(.<widget>-widget)` is unambiguous and
    // resolves on-demand on each access.
    const logcatTile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    const shellTile = page.locator('.tile').filter({ has: page.locator('.sh-widget') });
    const beforeLogcatBox = await logcatTile.boundingBox();
    const beforeShellBox = await shellTile.boundingBox();
    if (!beforeLogcatBox || !beforeShellBox) {
      throw new Error('tile bboxes missing');
    }

    const fromHead = logcatTile.locator('.tile-head');
    const toHead = shellTile.locator('.tile-head');
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

    // After the swap, the Logcat tile should sit where the Shell tile
    // used to be and vice versa. Compare the post-drop bboxes against
    // the pre-drop ones rather than checking `data-tile-id` ordering
    // (which is brittle with the absolute-positioned render).
    const afterLogcatBox = await logcatTile.boundingBox();
    const afterShellBox = await shellTile.boundingBox();
    if (!afterLogcatBox || !afterShellBox) throw new Error('post-drop bboxes missing');
    expect(Math.round(afterLogcatBox.x)).toBe(Math.round(beforeShellBox.x));
    expect(Math.round(afterShellBox.x)).toBe(Math.round(beforeLogcatBox.x));
  });

  test('dragging the seam between two tiles resizes them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await addWidget(page, /Shell/, '.sh-widget');
    await expect(page.locator('.tile')).toHaveCount(2);

    // Same selector idiom as the swap test — by widget class instead
    // of `.tile.nth(N)` so the resize assertion isn't sensitive to
    // DOM ordering or transient mid-render rects.
    const logcatTile = page.locator('.tile').filter({ has: page.locator('.lc-widget') });
    const before = await logcatTile.boundingBox();
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

    const after = await logcatTile.boundingBox();
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
