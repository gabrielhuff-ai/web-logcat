# Architecture

## Module map

```
src/
├── main.tsx                # entry: mounts <App/>, imports CSS
├── types.ts                # LogEntry, Filter, Tweaks, DeviceInfo, …
│
├── lib/
│   ├── filters.ts          # parse/match/highlight — pure, fully ported
│   ├── logGenerator.ts     # simulator, fully ported (used in dev)
│   ├── tweaks.ts           # useTweaks() hook — localStorage-backed prefs
│   └── adb.ts              # STUB — real WebUSB+ADB transport
│
├── components/
│   ├── App.tsx             # owns state, the stream effect, keyboard map
│   ├── EmptyState.tsx      # pre-connection screen
│   ├── Toolbar.tsx         # stub — see design/source/toolbar.jsx
│   ├── FilterBar.tsx       # stub — see design/source/filter-bar.jsx
│   ├── LevelRow.tsx        # functional, light styling
│   ├── LogList.tsx         # functional, naive (no virtualisation)
│   ├── LogRow.tsx          # functional, no highlight rendering yet
│   ├── Heatmap.tsx         # stub — returns null
│   ├── SettingsPanel.tsx   # stub — placeholder drawer
│   ├── SearchOverlay.tsx   # stub — wires input but no result rendering
│   └── Icons.tsx           # only the few icons used by the scaffold
│
└── styles/
    ├── tokens.css          # design original — colors, spacing, motion
    ├── app.css             # design original — layout + log row + panels
    └── components.css      # *added* — empty state, drawer, filter bar shell
```

The split `tokens.css` + `app.css` (design originals) versus
`components.css` (additions) lets the design CSS get refreshed from
`design/source/` without merge conflicts.

## State

Top-level state lives in `<App/>`:

| State                  | Type                            | Notes                                  |
| ---------------------- | ------------------------------- | -------------------------------------- |
| `device`               | `DeviceInfo \| null`            | `null` ⇒ render `<EmptyState/>`        |
| `usingFake`            | `boolean`                       | true when streaming the simulator      |
| `logs`                 | `LogEntry[]`                    | capped at `MAX_LOGS` (5000), FIFO trim |
| `filters`              | `Filter[]`                      | chip filters                           |
| `levelEnabled`         | `Record<LogLevel, boolean>`     | level pill state                       |
| `paused`               | `boolean`                       | pauses ingest, not rendering           |
| `autoScroll`           | `boolean`                       | tail mode                              |
| `onlyMatches`          | `boolean`                       | hide non-matching rows                 |
| `pinned`               | `Set<number>`                   | pinned row ids                         |
| `search` / `searchOpen`| `string` / `boolean`            | ⌘F overlay                             |
| `settingsOpen`         | `boolean`                       | drawer state                           |
| `tweaks`               | `Tweaks` (via `useTweaks`)      | persisted prefs                        |

Derived (memoised): `visibleLogs`, `rate`. Keep these as derived values
unless profiling proves a need for caching ingest-time.

## The stream

Currently a `setInterval(() => setLogs(prev => prev.concat(generateBatch(...))))`
inside `App.tsx`. The interval is gated by `pausedRef` (so toggling pause
doesn't re-create the interval).

When ADB lands, replace the simulator path with a subscription to the
parsed line stream from `lib/adb.ts`. The state shape doesn't change.

## Performance notes

- `<LogRow/>` is wrapped in `memo`, but the naïve list still renders
  every entry. Past ~500–1000 visible rows scrolling will stutter.
  Plan: `@tanstack/react-virtual` over `visibleLogs`. The pinned block
  stays outside the virtualised range.
- `entryMatches` is called per row per render. If `filters` is large,
  consider memoising per-entry match results keyed by `(entry.id, filters)`.

## Theming

`tokens.css` defines the entire palette as CSS custom properties keyed
off `--accent-hue` (set by `data-accent`) and theme (`data-theme`). The
`useTweaks` hook applies both attributes to `<html>` so changes propagate
without any JS-side recompute.
