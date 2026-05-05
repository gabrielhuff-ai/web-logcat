# web-logcat

Browser-based Android `logcat` viewer. Plug a phone into your laptop, click
**Connect**, and watch live logs stream in the browser — no `adb` install,
no Android Studio.

> Status: **feature-complete UI**, real ADB transport implemented but
> **untested against real hardware**. The simulated stream works end to
> end. See `docs/TASKS.md` for the punch list.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Click **Use simulated data** on the empty state to see the viewer in action.

## Stack

- **Vite + React + TypeScript** — chosen because the design handoff is
  already React; Vite gives us instant HMR and a tiny prod bundle.
- **CSS custom properties + `oklch()`** — themes & accent hues are computed
  per-property; no CSS-in-JS, no Tailwind. Tokens live in
  `src/styles/tokens.css` (preserved from the design bundle).
- **`@tanstack/react-virtual`** — virtualises the log list past 800 rows.
- **`@yume-chan/adb`** + WebUSB daemon transport — real ADB stream.
- **GitHub Pages** — zero-cost hosting, HTTPS by default (WebUSB requires
  it). Two environments: production at `/web-logcat/`, staging at
  `/web-logcat/staging/`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Repository layout

```
.github/workflows/   CI + Pages deploy
design/              Original Claude Design handoff bundle (reference only)
docs/                ARCHITECTURE, DEPLOYMENT, TASKS
src/
  components/        React components (App, Toolbar, FilterBar, …)
  lib/               Pure logic (filters, logGenerator, tweaks, adb stub)
  styles/            tokens.css + app.css (design originals) + components.css
  types.ts           Shared domain types
  main.tsx           Entry point
```

## Scripts

| Command            | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `npm run dev`      | Vite dev server with HMR                        |
| `npm run build`    | Type-check then produce `dist/` for Pages       |
| `npm run typecheck`| `tsc -b --noEmit`                               |
| `npm run lint`     | ESLint over `src/`                              |
| `npm run preview`  | Serve the built `dist/` locally                 |

## For contributors (humans and agents)

- [CONTRIBUTING.md](CONTRIBUTING.md) — branch naming, PR flow, deploy gates
- [CLAUDE.md](CLAUDE.md) — context for AI agents continuing this work
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map, state shape, conventions
- [docs/TASKS.md](docs/TASKS.md) — prioritised list of pending work

## License

TBD.
