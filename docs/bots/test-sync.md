# Test-sync rules (for agents)

> **The rule.** Core flows are exercised by tests, and the tests stay
> in sync with the behaviour they cover. New behaviour ships with new
> tests; existing tests get updated when the behaviour underneath them
> moves.

## Two test layers

| Layer | Runner | Lives in | What it covers |
| --- | --- | --- | --- |
| Unit | Vitest (`npm test`) | `src/**/*.{test,spec}.{ts,tsx}` | Pure logic — parsers, snap math, layout transforms, filter parsing, etc. No DOM, fixtures inline. |
| End-to-end | Playwright (`npm run e2e`) | `tests/*.spec.ts` | Behaviour in a real browser, driven against the [simulator](../features/simulator). Empty state, connect, every widget's happy path, dashboard chrome (drag, resize, eye toggle, undo, etc.). |

The real WebUSB transport is **not** in CI — there are no devices.
That path is exercised manually against the deployed staging URL
before promoting to production.

## Coverage contract — the canonical core flows

These flows must always have green e2e coverage. If you change the
behaviour, update the matching test in the same PR. If you remove the
behaviour, remove the test.

| Flow | Test fixture (current) |
| --- | --- |
| Empty state renders the connect / fake-data CTA | `empty state > renders the connect-or-fake-data card` |
| Clicking *fake data* swaps to the dashboard and starts streaming | `simulator > clicking "fake data" swaps in the dashboard …` |
| Filter bar autocomplete shows the five starter types | `filter bar > focusing the empty input shows …` |
| Filter chip commits and persists | `filter bar > typing a filter produces a chip` |
| `?` opens the help dialog | `keyboard shortcuts > ? opens the help dialog` |
| Palette has all five widget cards enabled | `dashboard > + Add widget opens the palette …` |
| Dumpsys runs a preset against the simulator | `dashboard > Dumpsys tile runs a preset …` |
| Files renders the toolbar + sdcard tree | `dashboard > adding a Files widget …` |
| Logcat tiles keep filters per-tile | `dashboard > adding a Logcat widget yields …` |
| Mirror renders + is capped at 1 instance | `dashboard > Mirror tile renders the simulated app frame …` |
| Shell runs simulator commands | `dashboard > adding a Shell widget runs the simulator commands` |
| Drag-to-swap rearranges tiles | `dashboard > dragging a tile by the grip onto another tile swaps them` |
| Drag-the-seam resizes tiles | `dashboard > dragging the seam between two tiles resizes them` |
| Eye toggle cycles bar mode | `dashboard > the eye toggle cycles bar mode` |
| Maximize / restore | `dashboard > maximize fills the viewport; restore returns to grid` |
| Clear layout empties the dashboard | `dashboard > Clear layout empties the dashboard …` |
| Cmd+Z / Cmd+Shift+Z undo / redo widget addition | `dashboard > Cmd+Z undoes a widget addition …` |
| Per-widget settings cog opens a modal for each kind | `dashboard > cog opens a per-widget settings modal …` (one test per kind) |
| Wrap toggle stays in sync between modal and on-bar control | `dashboard > Logcat modal "Wrap" toggle and on-bar wrap button …` |
| Palette dismiss paths (Esc / scrim / × button) | `dashboard > the +Add palette closes via Esc, scrim click, and the close button` |
| Global settings cog opens the dialog with both controls | `dashboard > global settings cog opens the dialog …` |

When the flow's UI selectors move, *update the existing test* — don't
add a parallel one. The fixture name is the contract; renaming it
breaks GitHub's flaky-test history.

## Adding a new widget

A new widget kind requires, at minimum, e2e coverage for:

1. The palette card is **enabled** when the widget kind is the only
   one of its kind, or up to its `maxInstances` cap.
2. Adding the widget from the palette spawns exactly one tile of that
   kind.
3. The widget's canonical happy-path interaction works against the
   simulator (Shell runs `pwd`; Dumpsys returns parsed cards; Files
   resolves a breadcrumb; Mirror renders the bezel + frame placeholder;
   Logcat shows streamed entries).
4. The cog opens a per-widget settings modal.
5. If the widget caps at one instance, the palette card disables
   after the cap is hit.

Mirror these patterns from the existing `tests/smoke.spec.ts` rather
than inventing a new style.

## Selector idioms

- Filter `.tile` by widget class (`.lc-widget`, `.sh-widget`, …) instead
  of `.tile.nth(N)`. The dwindle layout doesn't pin tiles to fixed
  DOM positions and `nth(N)` is brittle.
- For pointer-driven interactions that race with hover state
  (tooltip pseudo-elements, just-toggled suppression, head-hidden
  reveal strips), prefer
  `await el.evaluate((n) => (n as HTMLButtonElement).click())` over
  `await el.click()`. The DOM-level click skips Playwright's
  actionability checks and fires React's `onClick` deterministically.
- Use the `.beforeEach` already in `tests/smoke.spec.ts` to seed
  `localStorage` with `performanceMode: 'on'` — it disables tile
  position transitions so bbox probes after drags / resizes see the
  final layout, not a frame mid-easing.

## Adding new pure logic

Anything in `src/lib/` that doesn't touch the DOM gets a Vitest unit
test. The `lib/filters.test.ts` (when it exists) is the style to
mirror — fixtures inline, no helpers spread across files. Keep tests
side by side with the code:

```
src/lib/foo.ts
src/lib/foo.test.ts
```

The Vitest config picks up `src/**/*.{test,spec}.{ts,tsx}` — no
extra registration needed.

## When tests fail

- **Don't `--no-verify` past a failing hook.** Fix the underlying
  issue.
- **Don't disable the failing test to land the PR.** If a test is
  genuinely flaky (and you've verified it locally), surface it; don't
  just skip it.
- The Playwright trace lands in `playwright-report/` on failure (CI
  uploads it as an artefact). Read the trace before guessing.
