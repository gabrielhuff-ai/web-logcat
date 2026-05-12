# Dashboard & layout

The connected app is a **dwindle binary-tree layout** of widget tiles, the
same family of layouts you'd find in tiling window managers like Hyprland.
Every tile has the same chrome — a header, an optional toolbar, the widget
itself, and a corner grip — and they share every pixel of available space.

<ThemeImage src-dark="/img/features/dashboard-multi.png" src-light="/img/features/dashboard-multi-light.png" alt="Dashboard layout" />

## Adding and removing widgets

- **+ Add widget** in the topbar opens the [palette](./settings#palette).
  Picking a kind splits the focused tile in two, with the new widget
  occupying half the previous space.
- **× Close** in a tile's header removes it. The surviving sibling expands
  to fill the freed area.
- **Clear layout** empties the dashboard back to its empty CTA. Useful when
  you want to redraw from scratch.

## Rearranging

- **Swap by dragging the header.** Grab a tile by its header and drop it
  on another tile — they swap positions in the tree without resizing.
  Drop near an edge to split that side instead of swapping.
- **Hover-hold to commit mid-drag.** While dragging, *pause* the cursor
  over a valid drop zone for ~0.9 s. The drop overlay blinks once and
  the swap / restructure applies immediately, with your pointer still
  held — chain multiple edits in a single gesture. The dashboard also
  shakes (iOS-icon-edit-mode style) and widens the inter-tile gap while
  a drag is active so the drop zones read more clearly. Both visual
  affordances are skipped in **Performance mode** (Global settings →
  Appearance) since they rely on the same layout transitions Performance
  mode disables.
- **Resize the seam.** Hover the seam between two tiles; the cursor turns
  into a resize handle. Drag to redistribute space between siblings.
- **Maximize.** The square icon in a tile's header pops it to fill the
  entire dashboard. Click again (now a *Restore* icon) to drop back.
- **Hide the chrome.** The eye icon in the header cycles between
  *show everything* → *hide the toolbar* → *hide the toolbar **and** the
  header*. Use it when you want a tile to read like an embedded panel.

## Keyboard

The dashboard reads a small set of global shortcuts. None of them fire
while the focus is inside a text field, so typing into a Logcat filter
or Shell prompt is never affected.

| Key                 | Action                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `⌘E` / `Ctrl+E`     | Open the quick-add menu (see below).                                   |
| `← ↑ ↓ →`           | Move the focused-tile ring to the spatially-adjacent tile.             |
| `Backspace` / `Del` | Remove the focused tile. Inside the Files widget, deletes the selected entry instead (same as right-click → Delete). |
| `⌘Z` / `Ctrl+Z`     | Undo the last layout-changing action.                                  |
| `⌘⇧Z` / `Ctrl+⇧+Z`  | Redo.                                                                  |
| `?`                 | Open the keyboard-shortcut help dialog.                                |

### Quick-add menu

`⌘E` opens a Spotlight-style floating menu listing the available
widgets. Three ways to pick:

- Press a widget's single-letter accelerator — `L` (Logcat), `S`
  (Shell), `D` (Dumpsys), `F` (Files), `M` (Screen Mirror).
- Use `↑` / `↓` to cycle the highlight and `Enter` to confirm.
- Click the row directly.

The `More…` row opens the full widget palette dialog with
descriptions and capacity hints.

(The earlier prototype used `⌘N`, but macOS treats `⌘N` as a
system-level "new window" shortcut the browser can't intercept.
`⌘E` is unbound on every major browser + platform combination.)

The menu dismisses on Escape, outside-click, or any successful pick.
Widgets that are at their `maxInstances` cap (Screen Mirror is hard-
capped at 1) are greyed out and their accelerator is ignored.

## Undo and redo

- **⌘Z / Ctrl+Z** undoes the last layout-changing action — adding a tile,
  removing it, swapping, resizing, maximize, clear-layout. The history
  buffer lives inside the tile grid; reloading the page persists the
  current layout but not the undo stack.
- **⌘⇧Z / Ctrl+Shift+Z** redoes.

## Persistence

Layouts and per-widget settings persist in `localStorage` per device
serial:

- The tree itself: `weblogcat-dashboard-v2`.
- Per-widget state: keyed by `weblogcat:<kind>:<serial>:<tileId>` so two
  Logcat tiles on the same device keep independent filter setups across
  reloads.

Switching to a different device wakes that device's saved layout. The
demo device has its own separate slot.

## Sharing a layout via URL

The dashboard URL accepts a `?d=<encoded>` query string that captures the
current layout + tile settings. Clicking **Share** in the dashboard
copies a link with the current state encoded. Recipients open the link,
pair their own device, and land on your exact layout — chip filters and
all.

::: tip
URL state is **read-forward compatible**: WebLogcat keeps accepting older
`?d=` payload shapes so links you sent last month still resolve. See the
note in [release plan](../devs/release-plan) for the long-term contract.
:::
