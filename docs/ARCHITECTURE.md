# Architecture

## Module map (v2)

```
src/
├── main.tsx                      # entry: mounts <App/>, imports CSS
├── types.ts                      # LogEntry, Filter, Tweaks, DeviceInfo,
│                                 # WidgetKind, Tile, LayoutState
│
├── lib/
│   ├── filters.ts                # parse/match/highlight — pure
│   ├── logGenerator.ts           # simulator (lazy-loaded)
│   ├── tweaks.ts                 # useTweaks() — localStorage prefs
│   ├── adb.ts                    # WebUSB + ADB transport (lazy)
│   ├── adbContext.ts             # AdbContext + useAdb() hook
│   ├── AdbProvider.tsx           # <AdbProvider/> — wraps the dashboard
│   ├── logStream.ts              # LogStreamHub — single-upstream pub/sub
│   ├── logStreamContext.ts       # context + useLogStream()
│   ├── dashboardChrome.ts        # tweaks + showToast for widgets
│   ├── widgets.ts                # widget registry (kind → def)
│   ├── layout.ts                 # tile-grid snap math + persistence
│   ├── format.ts                 # formatTs, rowHeightFor
│   └── knownNames.ts             # static tag/process pools for autocomplete
│
├── components/
│   ├── App.tsx                   # owns device + LogStreamHub; renders
│   │                             # <EmptyState/> or <Dashboard/>
│   ├── EmptyState.tsx            # pre-connection screen
│   ├── Dashboard.tsx             # connected shell + DashTopbar
│   ├── TileGrid.tsx              # 12-col grid, drag/resize/maximize
│   ├── Tile.tsx                  # tile chrome (header + body + resize)
│   ├── WidgetPalette.tsx         # +Add widget modal
│   ├── FilterBar.tsx             # chip input + transport
│   ├── LevelRow.tsx              # V/D/I/W/E pills + rate
│   ├── LogList.tsx               # virtualised log area + sticky pinned block
│   ├── LogRow.tsx                # one log line, with highlight rendering
│   ├── Heatmap.tsx               # 60-cell gutter
│   ├── HelpDialog.tsx            # ? shortcuts dialog
│   ├── SearchOverlay.tsx         # ⌘F floating search box
│   ├── SettingsPanel.tsx         # legacy drawer (not currently mounted)
│   ├── Icons.tsx                 # inline SVG icon set
│   └── widgets/
│       ├── LogcatWidget.tsx      # the v1 logcat experience as a widget
│       └── StubWidget.tsx        # placeholder for not-yet-shipped kinds
│
└── styles/
    ├── tokens.css                # design original — colors, spacing, motion
    │                             # (extended with v2 --shadow-3 + --glass-line)
    ├── app.css                   # design original — layout + log row + panels
    ├── dashboard.css             # design original (v2) — tile grid + chrome
    └── components.css            # additions: heatmap, h-scroll, widget shells
```

`tokens.css`, `app.css`, and `dashboard.css` are **design originals** —
copied verbatim from `design/v1/source/styles.css` (tokens + app) and
`design/v2/source/dashboard.css`. The v1 → v2 design diff added two
tokens (`--shadow-3` + `--glass-line`); they're added inline at the top
of each theme block in `tokens.css`. Everything else stays untouched so
those files can be refreshed from the design source without merge
conflicts. New CSS goes into `components.css`.

## State

Top-level state lives in `<App/>`:

| State                  | Type                            | Notes                                  |
| ---------------------- | ------------------------------- | -------------------------------------- |
| `device`               | `DeviceInfo \| null`            | `null` ⇒ render `<EmptyState/>`        |
| `usingFake`            | `boolean`                       | true when streaming the simulator      |
| `adb`                  | `Adb \| null`                   | live ADB handle (Phase 6+)             |
| `tweaks`               | `Tweaks` (via `useTweaks`)      | persisted prefs                        |
| `toast`                | `string \| null`                | bottom-centre acknowledgement          |
| `helpOpen`             | `boolean`                       | `?` shortcuts dialog                   |

Widget state — filters, paused, autoScroll, levelEnabled, pinned,
expanded — moved from `<App/>` to `<LogcatWidget/>`. Two Logcat tiles
on the same device get independent chip bars (persisted under
`weblogcat:filters:<serial>:<tileId>`).

Tile-grid state lives in `<TileGrid/>`: the layout array, the maximized
tile id, and the in-flight drag/resize state. Persisted to
`localStorage` under `weblogcat-dashboard-v1`.

## The stream

`<App/>` owns a single `LogStreamHub` — see `lib/logStream.ts`. The
transport (real ADB or simulator) calls `hub.publishMany(entries)` once
per ingest tick; the hub keeps a ring buffer (cap `MAX_LOGS` = 5000)
and fans out to N `LogcatWidget` subscribers. New subscribers get a
snapshot on mount.

Why a hub: K Logcat tiles previously meant K shell channels and K ×
50k row buffers. With the hub there's one upstream and one buffer; per-
widget memory is just whatever the widget keeps for its filter view.

## Performance notes

- `<LogRow/>` is wrapped in `memo`; `<LogList/>` virtualises past 800
  visible rows via `@tanstack/react-virtual`.
- The drag/resize loop in `<TileGrid/>` coalesces pointer-move events
  into the next animation frame — protects against >120Hz pointer
  devices flooding React with state updates.

## Theming

`tokens.css` defines the entire palette as CSS custom properties keyed
off `--accent-hue` (set by `data-accent`) and theme (`data-theme`). The
`useTweaks` hook applies both attributes to `<html>` so changes propagate
without any JS-side recompute.
