# Appearance & settings

WebLogcat's chrome is intentionally small — most state belongs to
individual widgets. Two places carry global preferences: the
**appearance** popover and the **global settings** modal.

<ThemeImage src-dark="/img/features/topbar.png" src-light="/img/features/topbar-light.png" alt="Topbar" />

## Appearance popover

The half-circle icon in the topbar opens an appearance popover with
three controls:

- **Theme.** Light / Dark. Both are first-class — the design tokens are
  hand-tuned for both modes.
- **Color scheme.** Indigo, Teal, Amber, or Rose. Picks the accent hue
  that flows through buttons, focus rings, level pills, etc. — driven
  by `--accent-hue` in `tokens.css`.
- **Layout: Compact mode.** Drops the gap and the rounded corners between
  tiles so widgets share every pixel of the dashboard. Useful on smaller
  laptops.

Preferences persist via `localStorage` and apply instantly — no reload.

## Global settings modal

The cog icon in the topbar opens a modal with cross-cutting options:

- **Performance mode.** Disables the position transition on tiles and
  reduces a few non-essential animations. Auto-on if the OS reports
  `prefers-reduced-motion: reduce`. Pin to *On* if your laptop struggles
  with the dashboard at 120 Hz.
- **Simulated stream speed.** Affects only the [simulator](./simulator).
  Trickle / Steady / Firehose; defaults to Steady.
- **Reset all preferences.** Wipes every `weblogcat:*` `localStorage`
  key and reloads.

## Per-widget settings

Each widget exposes its own settings modal via the cog in its tile
header. The contents are widget-specific — see the relevant feature
page:

- [Logcat](./logcat#per-widget-settings)
- [Shell](./shell#per-widget-settings)
- [Dumpsys](./dumpsys#per-widget-settings)
- [Files](./files#per-widget-settings)
- [Screen Mirror](./screen-mirror#per-widget-settings)

## Widget palette

`+ Add widget` in the topbar opens the palette. Five cards, one per kind;
disabled cards (e.g. Mirror after one is already mounted) are greyed out
with the reason on hover.

The palette also supports the keyboard:

- `↑` / `↓` to move the selection.
- `Enter` to add the highlighted widget.
- `Esc` to dismiss.

## Help dialog

`?` anywhere in the app opens the **Keyboard shortcuts** dialog. It's the
authoritative list — the tables in this site are kept in sync but the
dialog is what ships in the build.
