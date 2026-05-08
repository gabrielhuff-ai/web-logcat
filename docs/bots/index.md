# For agents

This section is the operational contract for AI agents working on
WebLogcat. Pages are intentionally terse — the goal is *agent succeeds
at the task*, not *human enjoys the read*.

If you are a human contributor, [devs/](../devs/) is the friendlier
mirror of most of this material. The rules here apply to you too.

## Read these first

- [Widget contract](./widgets-contract) — what a new widget must satisfy
  to slot into the dashboard cleanly. Authoritative; the dashboard
  shared chrome assumes everything in this file.
- [Doc-sync rules](./doc-sync) — when and how to update the
  `docs/features/` pages alongside a code change. PRs that ship UI
  changes without a docs delta will be bounced.
- [Test-sync rules](./test-sync) — what new behaviour must be covered
  by `vitest` (unit) and `@playwright/test` (e2e), and how to keep the
  existing simulator-driven coverage current.
- [Screenshot pipeline](./screenshots) — how to refresh the docs and
  README screenshots on demand. Use this when a UI change affects
  imagery or when the user asks for a fresh shot.
- [Maintaining `bots/`](./maintaining) — how to fold your own
  learnings back into this directory without making it worse. Read
  before editing anything under `bots/`.

## Working principles (do these every time)

1. **Start with `CLAUDE.md` in the repo root.** It is the implicit
   prompt for this codebase and lists hard constraints (TS strict,
   no new runtime deps, zero-cost infra, history is read-only,
   `oklch()` for colours).
2. **Use the shared chrome.** Don't invent new patterns for things the
   dashboard already provides — toasts (`useDashboardChrome`), log
   stream (`useLogStream`), per-widget settings modal, eye-toggle bar
   modes, etc. Reach for the existing primitives first; if you can't
   make them work, ask before forking.
3. **Cover behaviour with tests in the same PR.** New widget → unit
   tests for any pure logic, e2e against the simulator. Existing
   widget changes → update the e2e selectors / assertions if the UI
   moved.
4. **Sync the user docs.** New flow → new section in the matching
   `docs/features/<kind>.md`. Renamed UI control → grep
   `docs/features/` and update. See [doc-sync](./doc-sync) for the full
   contract.
5. **Surface ambiguity early.** If the task spec is ambiguous, ask the
   user a short, specific question rather than guessing. Cleanup is
   more expensive than clarification.

## Where things live

- Production code: `src/` — see
  [devs/architecture](../devs/architecture).
- Build / deploy: `vite.config.ts`, `.github/workflows/`,
  [devs/deployment](../devs/deployment).
- Issue templates: `.github/ISSUE_TEMPLATE/`.
- Docs: `docs/` (this site).
- Tests: `tests/smoke.spec.ts` (Playwright e2e) and `src/**/*.test.ts`
  (Vitest unit).

## What "done" looks like

```
npm run typecheck     # strict TS
npm run lint          # eslint --max-warnings 0
npm test              # vitest run
npm run build         # vite build
npm run e2e           # playwright (simulator-driven)
npm run docs:build    # vitepress build
```

All green. Then commit, push to the branch the parent task assigned,
let CI gate the merge. Don't push to `release` directly.
