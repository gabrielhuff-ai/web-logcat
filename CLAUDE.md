# CLAUDE.md — context for AI agents working on this repo

This file is the implicit prompt every agent inherits when working on
`web-logcat`. Read it before doing anything substantive.

## What this project is

WebLogcat is a browser-based Android device inspector — a draggable,
resizable dashboard of Logcat, Shell, Dumpsys, Files, and Screen
Mirror tiles powered by WebUSB + ADB. Currently in **alpha**; the
release plan (alpha → beta → GA) lives at
[`docs/RELEASE_PLAN.md`](docs/RELEASE_PLAN.md).

The visual fidelity bar is high — the design is production-intent,
not a sketch.

## Where things live

- **Production code:** `src/`. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  for the module map.
- **Adding a widget?** [`docs/WIDGETS.md`](docs/WIDGETS.md) is the
  contract.
- **Deploy topology + ops:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Release phases / promotion procedure:**
  [`docs/RELEASE_PLAN.md`](docs/RELEASE_PLAN.md). Each phase has a
  prereq + steps block; an agent can be pointed at "do alpha prep"
  / "promote to beta" and execute it.
- **Issues / backlog:** GitHub Issues. Pick a labelled issue rather
  than inventing top-level work.

Doc convention: everything under `docs/ai/` is for agents only;
everything else under `docs/` is for both humans and agents. The
`docs/ai/` directory is currently empty — fill it as needed for
agent-only deep-dives.

## Hard constraints

- **TypeScript strict.** No `any`. No `// @ts-ignore` without an
  inline comment explaining why.
- **No new runtime dependencies** without explicit approval. The
  list in `package.json` is intentionally short.
- **Zero-cost infra.** GitHub Pages + GitHub Actions only. Don't
  propose Vercel / Netlify / etc. without checking with the user.
- **WebUSB requires HTTPS.** The deploy target is HTTPS; local dev
  is `localhost` (also allowed by the API). Tests of the real
  transport must happen against the deployed staging URL — there are
  no devices in CI.
- **High visual fidelity.** Use `oklch()` for new colours — never
  hardcode hex.
- **History is read-only.** Don't rewrite past commit history. The
  noise (co-author footers, session URLs) is intentional; rewriting
  invalidates every existing PR/issue SHA link.

## What "done" looks like for a task

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
  all pass.
- The behaviour is exercised by hand against the simulated stream
  (or, where relevant, against a real device — call out which one
  in the PR description).
- A short note in the PR description describing what changed and
  what was deliberately left for follow-up.
- Auto-merge is armed (the repo has it enabled; CI gates the merge).
- Patch version bumps are automatic on every `main` push — don't
  edit `package.json` for them. Major / minor bumps happen at the
  phase boundaries in `docs/RELEASE_PLAN.md` and are explicit.

## What "out of scope" looks like

- Adding tests, CI gates, or tooling not yet requested. Build the
  feature first; instrument later if the user asks.
- Refactoring the directory layout.
- Changing the deployment topology.
- Backwards-compatibility shims for in-flight features. The `?d=`
  URL state format is a special case — see the note in
  `docs/RELEASE_PLAN.md` — but in general we don't have legacy users
  yet.

## When you're stuck

Bias toward asking the user a short, specific question rather than
guessing. Ambiguity in a request is expected and worth surfacing.
