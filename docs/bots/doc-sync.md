# Doc-sync rules (for agents)

> **The rule.** Every PR that changes user-facing behaviour updates the
> matching `docs/features/` page in the same PR. PRs that ship UI
> changes without a docs delta will be bounced.

This page tells you exactly what counts as "user-facing behaviour" and
what the docs delta has to look like. Follow the checklist literally.

## When does this apply?

A PR is in scope if it does any of:

- Adds, removes, or renames a widget kind.
- Adds, removes, or renames a UI control (button, toolbar item,
  setting, menu entry).
- Changes a keyboard shortcut.
- Changes the meaning of an existing field, filter, level, or preset.
- Changes the empty state, the connection flow, the device-picker
  contents, or any topbar action.
- Changes the appearance of a tile in a way that makes existing
  screenshots look wrong (compact-mode toggle change, palette change,
  significant chrome reshuffle).

A PR is **out of scope** for doc-sync if it's a pure refactor, a
performance optimisation, a test-only change, a CI / tooling tweak,
or a code-comment / dead-code cleanup that doesn't show up in the UI.
Touch nothing under `docs/features/` in those PRs — keep the diff
focused.

## The checklist

For each change in scope, do the matching action:

| Code change | Doc action |
| --- | --- |
| New widget kind `<Kind>` | Create `docs/features/<kind>.md`. Add a row in `docs/features/index.md`'s "in this section" table. Add a sidebar entry in `docs/.vitepress/config.ts` under the `/features/` group. Add a row in `README.md`'s widgets table. |
| Removed widget kind | Delete `docs/features/<kind>.md`. Remove the index row, the sidebar entry, the README row, and any inbound links (`grep -r "/features/<kind>" docs/`). |
| Renamed widget | Move the file (`git mv`), rename the slug everywhere it appears: index table, sidebar config, README table, inbound links. |
| New UI control on widget X | Edit `docs/features/<x>.md`'s relevant section (or add one). If the control is in the per-widget settings modal, update the *Per-widget settings* section. |
| Removed UI control | Strip the matching paragraph / table row from `docs/features/<x>.md`. |
| Renamed UI control | Grep `docs/features/` for the old name and update verbatim. |
| Keyboard shortcut change | Update the *Keyboard shortcuts* table on the affected feature page. The in-app `?` dialog is the source of truth — verify the table matches what `HelpDialog.tsx` ships. |
| Tile chrome / appearance change | Re-run `npm run docs:screenshots` and review the captured PNG before committing. |
| New cross-cutting setting | Edit `docs/features/settings.md`. |
| New global shortcut | Edit `docs/features/settings.md` (or wherever the shortcut is documented) **and** update `HelpDialog.tsx`. |

## Screenshots

Run `npm run docs:screenshots` after a UI change that affects how a
captured shot looks. The script:

- Boots the app via `vite preview`.
- Drives the simulator (`fake data`) through each widget.
- Writes PNGs to `docs/features/img/<slug>.png`.

Real-device-only flows (Mirror's live frame, Files transfers, the
WebUSB pairing dialog) cannot be captured by the script. If the
relevant flow requires a real device, leave the existing PNG in place
and flag in the PR description that a future on-device pass is owed.

Don't capture against your own device's serial / IP / personal data.
The simulator's defaults are safe by design.

## Doc-only changes

If you're only updating docs, the same lint / typecheck / build /
test gates apply. The docs build (`npm run docs:build`) is part of
CI; broken VitePress markdown will fail it.

## Cross-references

Inbound links between feature pages use relative paths without `.md`:

```
[Logcat](./logcat)
[Test-sync rules](../bots/test-sync)
```

VitePress's `cleanUrls` is on; the `.md` suffix would 404.

## When the docs disagree with the UI

Trust the UI. The docs are documentation *of* the behaviour, not a
spec the UI must match. If you find drift while working on something
unrelated:

- If the fix is small and obviously correct, include it in your PR
  with a one-line note.
- If the fix is contentious or implies a behaviour question, open a
  separate issue or surface it to the user.

Don't quietly let drift accumulate.
