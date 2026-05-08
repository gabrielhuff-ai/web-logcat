# Widget contract (for agents)

This is the implementation contract a new widget must honour to slot
into the dashboard cleanly. The dashboard's shared chrome — drag,
resize, persist, palette — assumes everything below.

If you're a human looking for product-side widget documentation, see
[features/](../features/) instead. This page is about *how to add or
modify a widget*, not how to use one.

## Folder layout

```
src/components/widgets/<Kind>Widget.tsx     # the React component
src/styles/widgets/<kind>.css               # widget-scoped styles
src/lib/<Kind>Sim.ts        (optional)      # simulator-path fallback
```

Co-locate widget styles in `styles/widgets/<kind>.css` and import them
from the top of the widget component. The CSS chunk is then bundled
with the lazy widget chunk — it loads when the widget mounts, not on
every page load.

## Component shape

```tsx
export interface <Kind>WidgetProps {
  tileId: string;
}
```

Per-widget state lives inside the component. Persist anything that
should survive reloads under the `weblogcat:<kind>:<serial>:<tileId>`
key — the tile id keeps sibling instances independent.

```tsx
const key = `weblogcat:shell:${device.serial}:${tileId}`;
```

## Registry entry

`src/lib/widgets.ts` is the single source of truth for "what kinds
exist." Add an entry; `WidgetPalette` and `TileGrid` consult the
registry — no other edits required.

```ts
shell: {
  name: 'Shell',
  icon: Icons.Terminal,
  desc: 'Interactive ADB shell',
  comp: ShellWidget,
  defaultSize: { w: 6, h: 6 },
  enabled: true,           // false ⇒ palette card greys out
  maxInstances: undefined, // omit unless capped (Mirror is 1)
}
```

## Reading the active ADB session

```ts
import { useAdb } from '../../lib/adbContext';
const { device, adb, usingFake } = useAdb();
```

- `device` — the active `DeviceInfo` (never null inside a connected
  dashboard; widgets unmount when the device disconnects).
- `adb` — the live `Adb` handle from `@yume-chan/adb`. Null when
  `usingFake` is true. Use it for `adb.subprocess.shell.spawn()`,
  `adb.sync()`, etc.
- `usingFake` — flip on the simulator path, e.g. swap `adb.subprocess`
  calls for an in-memory fake.

For Logcat-style streams, prefer `useLogStream()` from
`lib/logStreamContext.ts` over opening your own subprocess — there's
already one upstream `logcat` per session and the hub fans entries out
to N subscribers.

## Bars-hidden / `widget-bar` class

The tile header has an eye toggle that flips `barsHidden` on the tile.
The CSS rule (in `src/styles/dashboard.css`) hides any internal toolbar
matching:

```
.tile.bars-hidden .widget-bar,
.tile.bars-hidden .lc-toolbar,
.tile.bars-hidden .ds-toolbar,
.tile.bars-hidden .fx-toolbar,
.tile.bars-hidden .mr-toolbar,
.tile.bars-hidden .filter-bar { display: none !important }
```

So the convention is: every widget's top toolbar carries class
`widget-bar` (plus its own widget-specific class for styling).

## Errors and toasts

Widget errors that the user should see go through
`useDashboardChrome()`:

```ts
const { showToast } = useDashboardChrome();
try { … } catch (e) { showToast(e.message); }
```

The toast layer is mounted once at the App root and displays for
~1.8 s. Use it sparingly — chrome-level acknowledgements only
(connect / disconnect / clear / errors). Per-widget status belongs in
the widget body.

## Per-widget keyboard shortcuts

Global shortcuts (the help dialog `?`) live in `App.tsx`. Widget
shortcuts must be scoped to focus inside the widget — otherwise two
Logcat tiles fire `Cmd+F` on each other. The standard pattern:

```tsx
const rootRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const root = rootRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    /* … */
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);

return <div ref={rootRef} tabIndex={-1} onMouseDown={focusOnClick}>{…}</div>;
```

## Per-widget settings modal

Cog in the tile header opens `WidgetSettingsModal` keyed by the
widget kind. Widgets contribute their schema by exporting a
`settings` definition picked up by the modal. Per-widget settings
persist under `weblogcat:<kind>:<serial>:<tileId>:settings`.

## Testing (mandatory, see [test-sync](./test-sync))

- **Pure logic** (parsers, snap math) → Vitest under `src/lib/`.
  Mirror the `lib/filters.test.ts` style — no DOM, fixtures inline.
- **Behaviour** → Playwright e2e under `tests/`. Drive the simulator
  path; cover at minimum:
  - the widget appears in the palette and is **enabled**;
  - adding it from the palette spawns exactly one tile of that kind;
  - the canonical happy-path interaction (Shell: `pwd` returns
    `/sdcard`; Dumpsys: default preset renders cards; Files:
    breadcrumb resolves; Mirror: bezel renders + cap honoured;
    Logcat: per-tile filter independence).
- **Real ADB transport** stays manual against a real device on the
  staging URL. WebUSB cannot be exercised in headless CI.

## Documentation (mandatory, see [doc-sync](./doc-sync))

A new widget kind requires:

- `docs/features/<kind>.md` — the user-facing page.
- A row in `docs/features/index.md`'s "in this section" table.
- A sidebar entry in `docs/.vitepress/config.ts` under `/features/`.
- A row in `README.md`'s widgets table.
- A screenshot at `docs/features/img/<kind>-default.png` (or a
  placeholder noted in the alt-text if it requires a real device).
