# CLAUDE.md — context for AI agents working on this repo

This file is the implicit prompt every agent inherits when working on
`web-logcat`. Read it before doing anything substantive.

## What this project is

A browser-based Android device inspector. Originally a logcat viewer
(v1), now evolving into a multi-widget dashboard (v2) with Logcat,
Shell, Dumpsys, Files, and Screen Mirror tiles. The visual fidelity
bar is **high** — the design is production-intent, not a sketch.

The design hand-off is versioned:

- [`design/v1/HANDOFF.md`](design/v1/HANDOFF.md) + `design/v1/source/`
  — the original single-purpose logcat viewer. Already implemented in
  `src/`; treat as historical reference for what's already shipped.
- [`design/v2/HANDOFF.md`](design/v2/HANDOFF.md) + `design/v2/source/`
  — the current target. Wraps the v1 logcat as one widget inside a
  draggable / resizable tile grid and adds four more widgets. **All
  new work targets v2.**

## Where things live

- **Current spec / design intent:** `design/v2/HANDOFF.md`
- **Reference React + CSS prototype (v2):** `design/v2/source/*.jsx`
  and `design/v2/source/*.css`. These are *not* imported anywhere;
  they exist so the implementation can be checked against the hand-off.
- **Historical v1 prototype:** `design/v1/source/`. Existing
  `src/components/*.tsx` ported from these files.
- **Production code:** `src/`. See `docs/ARCHITECTURE.md` for the map.
- **Pending work:** `docs/TASKS.md`. Pick the top unchecked task; do not
  invent new top-level work without checking with the user.

## How to port a component

1. Open the matching file under `design/v2/source/` (or
   `design/v1/source/` when touching already-ported logcat internals).
2. Translate to TypeScript + React 18 idioms (functional components,
   `useState`/`useEffect`, no `React.createElement` boilerplate).
3. Use the types in `src/types.ts`. Don't widen them; if you need a new
   shape, add it there.
4. Wire it into `src/components/App.tsx`. State lives in `App.tsx` —
   don't introduce a store or a context unless you have a concrete reason
   that's documented in the PR.
5. Don't touch `src/styles/tokens.css` or `src/styles/app.css` — those
   are the design originals. Add new rules to
   `src/styles/components.css` (or its successor split-out files).

## Hard constraints

- **TypeScript strict.** No `any`. No `// @ts-ignore` without an inline
  comment explaining why.
- **No new runtime dependencies** without explicit approval. The list in
  `package.json` is intentionally short. Acceptable additions when the
  matching task is reached:
  - `@yume-chan/adb` + `@yume-chan/adb-daemon-webusb` — for the real ADB
    transport (see `src/lib/adb.ts` and `docs/TASKS.md`).
  - `@tanstack/react-virtual` — for log list virtualisation past ~5k rows.
- **Zero-cost infra.** GitHub Pages + GitHub Actions only. Don't propose
  Vercel/Netlify/etc. without checking with the user.
- **WebUSB requires HTTPS.** The deploy target is HTTPS; local dev is
  localhost (also allowed by the API). Tests of the real transport must
  happen against the deployed staging URL.
- **High visual fidelity.** Match `design/v2/HANDOFF.md` pixel-perfectly.
  Use `oklch()` for new colors — never hardcode hex.

## What "done" looks like for a task

- Types compile (`npm run typecheck`).
- App builds (`npm run build`) and runs locally (`npm run dev`).
- The new behaviour is exercised by hand against the simulated stream.
- The relevant entry in `docs/TASKS.md` is checked off in the same PR.
- A short note added to the PR description describing what changed and
  what was deliberately left for follow-up.

## What "out of scope" looks like

- Adding tests, CI gates, or tooling not yet requested. (The first agent
  laid groundwork; subsequent agents should fill in features, not
  re-architect.)
- Refactoring the directory layout.
- Changing the deployment topology (GH Pages staging/production split).
- Backwards-compatibility shims — there are no users yet.

## When you're stuck

Bias toward asking the user a short, specific question rather than
guessing. The user explicitly invited this two-step "Opus → Sonnet" flow;
ambiguity in the hand-off is expected and worth surfacing.
