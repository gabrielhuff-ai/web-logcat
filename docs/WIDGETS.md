# Widget conventions

The dashboard hosts widgets — each widget is one ADB capability rendered
inside a draggable / resizable tile. This doc is the contract a new
widget needs to honour to slot in cleanly. It is intentionally short:
all the heavy lifting (drag/resize/persist/palette) is shared.

## Folder layout

```
src/components/widgets/<Kind>Widget.tsx     # the component
src/lib/<Kind>Sim.ts        (optional)      # fake-data fallback for the simulator
```

The component takes a single prop: `{ tileId: string }`. Per-widget
state lives inside the component. Persist anything you want to survive
reloads under `weblogcat:<kind>:<serial>:<tileId>` — the tile id keeps
sibling instances independent.

## Registering a kind

`src/lib/widgets.ts` is the single source of truth. To add a kind:

```ts
shell: {
  name: 'Shell',
  icon: Icons.Terminal,
  desc: 'Interactive ADB shell',
  comp: ShellWidget,
  defaultSize: { w: 6, h: 6 },
  enabled: true,           // false ⇒ palette card greys out
  maxInstances: undefined, // omit unless capped (Mirror is 1)
},
```

`WidgetPalette` and `TileGrid` both consult the registry — no other
edits are required.

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
The CSS rule (in `src/styles/dashboard.css`) hides any internal
toolbar matching:

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

Widget errors that the user should see go through `useDashboardChrome()`:

```ts
const { showToast } = useDashboardChrome();
try { … } catch (e) { showToast(e.message); }
```

The toast layer is mounted once at the App root and displays for ~1.8s.
Use it sparingly — chrome-level acknowledgements only (connect /
disconnect / clear / errors). Per-widget status belongs in the widget.

## Per-widget keyboard shortcuts

Global shortcuts (the help dialog `?`) live in `App.tsx`. Widget
shortcuts must be scoped to focus inside that widget — otherwise two
Logcat tiles will fire `Cmd+F` on each other. The standard pattern:

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

## Testing

- Pure logic (parsers, snap math): Vitest under `src/lib/`. Mirror the
  `lib/filters.test.ts` style — no DOM, fixtures inline.
- Anything that touches the real ADB transport stays manual against a
  Pixel/Galaxy on the staging URL — WebUSB cannot be exercised in
  headless CI.
