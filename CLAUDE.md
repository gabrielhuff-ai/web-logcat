# CLAUDE.md — context for AI agents working on this repo

This file is the implicit prompt every agent inherits when working on
`web-logcat`. Read it before doing anything substantive, then jump
into the agent-only contracts under [`docs/bots/`](docs/bots/).

## What this project is

WebLogcat is a browser-based Android device inspector — a draggable,
resizable dashboard of Logcat, Shell, Dumpsys, Files, and Screen
Mirror tiles powered by WebUSB + ADB. Currently in **alpha**; the
release plan (alpha → beta → GA) lives at
[`docs/devs/release-plan.md`](docs/devs/release-plan.md).

The visual fidelity bar is high — the design is production-intent,
not a sketch.

## Where things live

The `docs/` directory is a published [VitePress](https://vitepress.dev/)
site with three audience-segmented sections. Use them like this:

- **Agent contracts** (read these before touching code):
  - [`docs/bots/widgets-contract.md`](docs/bots/widgets-contract.md)
    — what a new widget must satisfy.
  - [`docs/bots/doc-sync.md`](docs/bots/doc-sync.md) — when and how
    to update `docs/features/` alongside a code change. **PRs that
    ship UI changes without a docs delta will be bounced.**
  - [`docs/bots/test-sync.md`](docs/bots/test-sync.md) — what
    behaviour must be covered by unit + e2e tests, and how to keep
    the existing simulator-driven coverage current. **New behaviour
    ships with new tests; existing tests get updated when the
    behaviour underneath them moves.**
  - [`docs/bots/maintaining.md`](docs/bots/maintaining.md) — how
    to fold your own learnings back into `bots/` without making it
    worse (protected directives that must not be deleted, size
    budget per file, append-don't-fork rule). Read before editing
    anything under `bots/`.
- **Contributor reference** (humans + bots):
  - [`docs/devs/architecture.md`](docs/devs/architecture.md) —
    module map.
  - [`docs/devs/deployment.md`](docs/devs/deployment.md) — Pages
    topology, gh-pages mechanic, docs-site publish path.
  - [`docs/devs/release-plan.md`](docs/devs/release-plan.md) —
    promotion procedure, phase prereqs.
  - [`docs/devs/contributing.md`](docs/devs/contributing.md) —
    branches, lint / test / build commands.
  - [`docs/devs/docs-conventions.md`](docs/devs/docs-conventions.md)
    — how the docs site is structured and the screenshot pipeline.
- **User-facing product docs:** [`docs/features/`](docs/features/)
  — published at `<base>/docs/features/`. Touched only when behaviour
  user-facing changes (see [doc-sync](docs/bots/doc-sync.md)).
- **Production code:** `src/`. See architecture map above.
- **Issues / backlog:** GitHub Issues. Pick a labelled issue rather
  than inventing top-level work.

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
- **Docs and tests stay in sync with the app.** The
  [doc-sync](docs/bots/doc-sync.md) and
  [test-sync](docs/bots/test-sync.md) contracts are not optional.

## What "done" looks like for a task

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run e2e`, and `npm run docs:build` all pass.
- The behaviour is exercised by hand against the simulated stream
  (or, where relevant, against a real device — call out which one
  in the PR description).
- User-facing changes have a matching update under `docs/features/`
  in the same PR (see [doc-sync](docs/bots/doc-sync.md)).
- Core flows are exercised by tests in the same PR (see
  [test-sync](docs/bots/test-sync.md)).
- A short note in the PR description describing what changed and
  what was deliberately left for follow-up.
- Auto-merge is armed (the repo has it enabled; CI gates the merge).
- Patch version bumps are automatic on every `main` push — don't
  edit `package.json` for them. Major / minor bumps happen at the
  phase boundaries in `docs/devs/release-plan.md` and are explicit.

## What "out of scope" looks like

- Adding CI gates or tooling not yet requested.
- Refactoring the directory layout.
- Changing the deployment topology.
- Backwards-compatibility shims for in-flight features. The `?d=`
  URL state format is a special case — see the note in
  `docs/devs/release-plan.md` — but in general we don't have legacy
  users yet.

## When you're stuck

Bias toward asking the user a short, specific question rather than
guessing. Ambiguity in a request is expected and worth surfacing.
