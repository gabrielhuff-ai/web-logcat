// Scripting widget — simulator-path e2e.
//
// Covers the test-sync checklist for a new widget: it appears in the palette
// and is enabled; adding it spawns exactly one tile; and the canonical
// happy-path interaction (press an action button, see its function's output in
// the console) works against the simulator. A pre-seeded panel exercises the
// run path without driving the whole builder UI; a separate test confirms the
// builder opens and the empty state renders.

import { test, expect } from '@playwright/test';

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
      ([tileId, panel]) => {
        const layout = {
          tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
          tree: { type: 'leaf', id: tileId },
          focusId: tileId,
        };
        localStorage.setItem('weblogcat-dashboard-v2', JSON.stringify(layout));
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(panel));
      },
      [TILE_ID, PANEL],
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
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_tg', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    // Flipping the toggle runs notify() with NOTIFY=1 (no button needed).
    const toggle = tile.getByRole('switch', { name: 'Notify' });
    await expect(toggle).toContainText('Off');
    await toggle.click();
    await expect(toggle).toContainText('On');
    await expect(tile.locator('.sc-console-body')).toContainText('flipped 1');
  });

  test('a toggle with custom Values exports them instead of 1/0', async ({ page }) => {
    const panel = {
      script: 'mode() {\n  echo "mode $MODE"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        {
          id: 'tg',
          kind: 'toggle',
          label: 'Mode',
          defaultValue: false,
          onChange: 'run',
          bindOutputTo: 'console',
          values: ['paused', 'live'],
        },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_tgv', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    // Flipping on exports the configured "on" value, not "1".
    await tile.getByRole('switch', { name: 'Mode' }).click();
    await expect(tile.locator('.sc-console-body')).toContainText('mode live');
  });

  test('a multi-line text input renders a textarea and exports newlines verbatim', async ({ page }) => {
    const panel = {
      script: 'show() {\n  echo "$TARGET"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'in', kind: 'text', label: 'Target', multiline: true, defaultValue: '', onChange: 'none' },
        { id: 'btn', kind: 'button', label: 'Show', variant: 'default', confirm: false, bindOutputTo: 'console' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_ml', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });

    // A multi-line text input renders a <textarea>, not a single-line <input>.
    const field = tile.locator('.sc-text.multiline textarea');
    await expect(field).toBeVisible();
    await field.fill('alpha\nbeta');

    // Running echoes $TARGET with its newline intact → both lines reach the console.
    await tile.locator('.sc-btn').filter({ hasText: 'Show' }).click();
    const body = tile.locator('.sc-console-body');
    await expect(body).toContainText('alpha');
    await expect(body).toContainText('beta');
  });

  test('a description tooltip stays open when hovered so its link is clickable', async ({ page }) => {
    const panel = {
      script: 'noop() { :; }\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        {
          id: 'in',
          kind: 'text',
          label: 'Target',
          description: 'See the [guide](https://example.com/guide).',
          defaultValue: 'x',
          onChange: 'none',
        },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_tip', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });

    // Hovering the info dot reveals the tooltip; moving the cursor onto the
    // bubble keeps it open (it used to vanish in the gap), so the link inside
    // can be reached and clicked.
    await tile.locator('.sc-lbl-info').hover();
    const tip = page.locator('.sc-tip');
    await expect(tip).toBeVisible();
    const link = tip.getByRole('link', { name: 'guide' });
    await link.hover();
    await expect(tip).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://example.com/guide');
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

  test('a console renders ANSI colours and emoji from echo -e output', async ({ page }) => {
    const panel = {
      script: 'colors() {\n  echo -e "\\e[31mERR\\e[0m \\e[32mOK\\e[0m 🎉"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'b', kind: 'button', label: 'Colors', variant: 'default', confirm: false, bindOutputTo: 'console', mode: 'once' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_col', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.locator('.sc-btn').filter({ hasText: 'Colors' }).click();

    const body = tile.locator('.sc-console-body');
    await expect(body.locator('.sc-ansi-fg-red')).toContainText('ERR');
    await expect(body.locator('.sc-ansi-fg-green')).toContainText('OK');
    // Emoji survives the ANSI parser and reaches the DOM.
    await expect(body).toContainText('🎉');
  });

  test('a console renders combined SGR codes, attributes, and 256/truecolour', async ({ page }) => {
    const panel = {
      script: [
        'styles() {',
        '  echo -e "\\033[1;31mBold red\\033[0m"', // combined codes (semicolon)
        '  echo -e "\\033[9mStruck\\033[0m"', // strikethrough
        '  echo -e "\\033[38;2;255;105;180mHot pink\\033[0m"', // truecolour
        '}',
      ].join('\n'),
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'b', kind: 'button', label: 'Styles', variant: 'default', confirm: false, bindOutputTo: 'console', mode: 'once' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_sgr', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.locator('.sc-btn').filter({ hasText: 'Styles' }).click();

    const body = tile.locator('.sc-console-body');
    // `\033[1;31m` is NOT truncated at the semicolon — bold + red on one span.
    await expect(body.locator('.sc-ansi-fg-red.sc-ansi-bold')).toContainText('Bold red');
    await expect(body.locator('.sc-ansi-strike')).toContainText('Struck');
    // Truecolour renders as an inline rgb() colour.
    await expect(body.getByText('Hot pink')).toHaveCSS('color', 'rgb(255, 105, 180)');
  });

  test('a console renders its output at the configured font size', async ({ page }) => {
    const panel = {
      script: 'greet() {\n  echo "hi"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'b', kind: 'button', label: 'Greet', variant: 'default', confirm: false, bindOutputTo: 'console', mode: 'once' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true, fontSize: 20 },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_fontsize', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    // The configured 20px overrides the default console text size.
    await expect(tile.locator('.sc-console-body')).toHaveCSS('font-size', '20px');
    // Default line spacing is 0 → line-height equals the font size (tight).
    await expect(tile.locator('.sc-console-body')).toHaveCSS('line-height', '20px');
  });

  test('a console honours its line-spacing setting', async ({ page }) => {
    const panel = {
      script: 'greet() {\n  echo "hi"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'b', kind: 'button', label: 'Greet', variant: 'default', confirm: false, bindOutputTo: 'console', mode: 'once' },
        // 0.5em of extra spacing on a 20px font → line-height 30px.
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true, fontSize: 20, lineSpacing: 0.5 },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_linesp', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await expect(tile.locator('.sc-console-body')).toHaveCSS('line-height', '30px');
  });

  test('the script editor indents and comments via Tab and Cmd/Ctrl+/', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    await page.getByRole('button', { name: /add widget/i }).click();
    await page.locator('.palette-card').filter({ hasText: 'Scripting' }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.getByRole('button', { name: /widget settings/i }).click();
    const dialog = page.getByRole('dialog', { name: /scripting settings/i });
    const editor = dialog.getByLabel('Shell script');

    await editor.fill('echo hi');
    // Tab at the line start indents by two spaces.
    await editor.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(0, 0));
    await editor.press('Tab');
    await expect(editor).toHaveValue('  echo hi');
    // Shift+Tab removes the indent again.
    await editor.press('Shift+Tab');
    await expect(editor).toHaveValue('echo hi');
    // Ctrl+/ toggles a `#` comment on the line, and back.
    await editor.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(0, 0));
    await editor.press('Control+/');
    await expect(editor).toHaveValue('# echo hi');
    await editor.press('Control+/');
    await expect(editor).toHaveValue('echo hi');
  });

  test('a console can hide the leading "$ command" line', async ({ page }) => {
    const panel = {
      script: 'greet() {\n  echo "hello world"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'b', kind: 'button', label: 'Greet', variant: 'default', confirm: false, bindOutputTo: 'console', mode: 'once' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'recent', copyButton: true, autoScroll: true, hideCommand: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_hide', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    await tile.locator('.sc-btn').filter({ hasText: 'Greet' }).click();

    const body = tile.locator('.sc-console-body');
    await expect(body).toContainText('hello world');
    // The `$ greet` command line is suppressed.
    await expect(body.locator('.k-cmd')).toHaveCount(0);
    await expect(body).not.toContainText('$ greet');
  });

  test('a daemon with controls toggles a background stream on and off', async ({ page }) => {
    const panel = {
      // A never-returning function (loop) so the simulator keeps it running
      // until the user stops it.
      script: 'watch() {\n  while :; do\n    echo -e "\\e[32mline up\\e[0m"\n    echo "beat 🐢"\n  done\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        {
          id: 'd',
          kind: 'daemon',
          label: 'Watch',
          bindOutputTo: 'console',
          showControls: true,
          autoStart: false,
        },
        { id: 'con', kind: 'console', label: 'Console', scope: 'scrollback', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_daemon', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });

    // autoStart is off, so it begins stopped — the whole surface is the toggle.
    const daemon = tile.locator('.sc-daemon');
    await expect(daemon).toContainText('stopped');
    await expect(daemon).toHaveAttribute('aria-label', /^Start /);

    // Click the control: LED goes green, the console shows the live pill + lines.
    await daemon.click();
    await expect(daemon).toContainText('running');
    await expect(daemon).toHaveAttribute('aria-label', /^Stop /);
    await expect(tile.locator('.sc-exit.live')).toContainText('streaming');
    await expect(tile.locator('.sc-console-body')).toContainText('line up');
    await expect(tile.locator('.sc-console-body')).toContainText('🐢');

    // Click again: back to stopped, the live pill gives way to a neutral marker.
    await daemon.click();
    await expect(daemon).toContainText('stopped');
    await expect(daemon).toHaveAttribute('aria-label', /^Start /);
    await expect(tile.locator('.sc-exit.live')).toHaveCount(0);
  });

  test('a headless daemon auto-starts on load and feeds a chrome-less console', async ({ page }) => {
    const panel = {
      script: 'watch() {\n  echo "auto tick"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        // showControls off → no on-panel UI; autoStart defaults on.
        { id: 'd', kind: 'daemon', label: 'Watch', bindOutputTo: 'console' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'scrollback', copyButton: true, autoScroll: true, hideChrome: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_headless', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    // No daemon UI is rendered (headless), and the console header is hidden.
    await expect(tile.locator('.sc-daemon')).toHaveCount(0);
    await expect(tile.locator('.sc-console-head')).toHaveCount(0);
    // It auto-started, so output appears with no interaction.
    await expect(tile.locator('.sc-console-body')).toContainText('auto tick');
  });

  test('a daemon that exits cleanly transitions to a finished state', async ({ page }) => {
    const panel = {
      script: 'watch() {\n  echo "all done"\n  exit 0\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'd', kind: 'daemon', label: 'Watch', bindOutputTo: 'console', showControls: true, autoStart: true },
        { id: 'con', kind: 'console', label: 'Console', scope: 'scrollback', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_finish', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    const daemon = tile.locator('.sc-daemon');
    // Auto-started, runs once, then exits 0 → finished (not stopped, not error).
    await expect(daemon).toContainText('finished');
    await expect(tile.locator('.sc-console-body')).toContainText('all done');
    // Terminal but re-runnable: the surface offers Start again.
    await expect(daemon).toHaveAttribute('aria-label', /^Start /);
  });

  test('a daemon with restart "on success" re-runs instead of finishing', async ({ page }) => {
    const panel = {
      script: 'report() {\n  echo "tick"\n  exit 0\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'd', kind: 'daemon', label: 'Report', bindOutputTo: 'console', showControls: true, autoStart: true, restart: 'on-success' },
        { id: 'con', kind: 'console', label: 'Console', scope: 'scrollback', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_restart', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    const daemon = tile.locator('.sc-daemon');
    // It exits 0 each run, but the policy relaunches it — so it stays running
    // and never settles into the terminal "finished" state (which the same
    // function reaches under the default "Never" policy).
    await expect(tile.locator('.sc-console-body')).toContainText('tick');
    await expect(daemon).toContainText('running');
    await expect(daemon).not.toContainText('finished');
  });

  test('a finite daemon that prints then clears finishes once (no looping, no flicker)', async ({ page }) => {
    // Regression: in the simulator a finite function used to loop forever and
    // `clear` did nothing. It should run once, clear, and finish — like a real
    // device — and the empty-state hint must not flash after the clear.
    const panel = {
      script: 'show() {\n  echo -e "Foo"\n  clear\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        // restart defaults to "no".
        { id: 'd', kind: 'daemon', label: 'Show', bindOutputTo: 'console', showControls: true, autoStart: true },
        { id: 'con', kind: 'console', label: 'Console', scope: 'scrollback', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_printclear', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    const daemon = tile.locator('.sc-daemon');
    const body = tile.locator('.sc-console-body');
    // Runs once → finished (did not loop), and "Foo" was cleared away.
    await expect(daemon).toContainText('finished');
    await expect(body).not.toContainText('Foo');
    await expect(body.locator('.sc-console-line')).toHaveCount(0);
    // The cleared console stays blank — the "no runs yet" hint must not appear.
    await expect(body.locator('.sc-console-empty')).toHaveCount(0);
  });

  test('a daemon clears the console with a standard clear sequence', async ({ page }) => {
    // Each emission clears the screen then prints one line, so the console
    // never accumulates — it shows only the latest "frame".
    const panel = {
      script: 'watch() {\n  echo -e "\\033[2Jrepaint"\n}\n',
      runAsRoot: false,
      fontSize: 12,
      controls: [
        { id: 'd', kind: 'daemon', label: 'Watch', bindOutputTo: 'console', showControls: false, autoStart: true },
        { id: 'con', kind: 'console', label: 'Console', scope: 'scrollback', copyButton: true, autoScroll: true },
      ],
    };
    await page.addInitScript(
      ([tileId, p]) => {
        localStorage.setItem(
          'weblogcat-dashboard-v2',
          JSON.stringify({
            tiles: { [tileId]: { id: tileId, kind: 'scripting' } },
            tree: { type: 'leaf', id: tileId },
            focusId: tileId,
          }),
        );
        localStorage.setItem(`weblogcat:settings:${tileId}:scripting`, JSON.stringify(p));
      },
      ['t_clear', panel],
    );

    await page.goto('/');
    await page.getByRole('button', { name: /fake data/i }).click();
    const tile = page.locator('.tile').filter({ has: page.locator('.sw-body') });
    const body = tile.locator('.sc-console-body');
    await expect(body).toContainText('repaint');
    // The clear wiped the synthetic `$ watch` header and prevents accumulation:
    // exactly one line remains no matter how many times it repaints.
    await expect(body.locator('.sc-console-line')).toHaveCount(1);
    await expect(body).not.toContainText('$ watch');
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
