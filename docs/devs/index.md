# Contributing

WebLogcat is a small repo with a clear scope. These pages are the
contributor-facing reference — what the codebase looks like, how it
deploys, how to keep it in shape as it grows.

If you're an AI agent working on the repo, head to the
[For agents](../bots/) section first — it has the contracts you need to
honour. The pages here are still useful background, but the agent
section is what tells you what to do.

## Pages

| Page | Use it for |
| --- | --- |
| [Contributing guide](./contributing) | Branch model, dev / build / lint / test commands, deploy gates |
| [Architecture](./architecture) | Module map, top-level state, perf notes |
| [Deployment](./deployment) | GitHub Pages topology, staging vs production, the gh-pages mechanic |
| [Release plan](./release-plan) | Alpha → beta → GA promotion procedure with prereqs and steps |
| [Docs conventions](./docs-conventions) | How this docs site is structured and what contributors must keep in sync |

## What "done" looks like for a task

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  and `npm run e2e` all pass.
- The behaviour was exercised by hand against the simulated stream (or,
  where relevant, against a real device — call out which one in the
  PR description).
- New or changed user-facing behaviour has a corresponding update to
  the [features docs](../features/) — see [docs-conventions](./docs-conventions).
- Core flows are exercised by tests — see
  [test-sync rules](../bots/test-sync) (these apply equally to humans).
- A short note in the PR describing what changed and what was
  deliberately left for follow-up.
- Auto-merge is armed (the repo has it enabled; CI gates the merge).

## Hard constraints

- **TypeScript strict.** No `any`. No `// @ts-ignore` without an inline
  comment explaining why.
- **No new runtime dependencies** without explicit approval. The list
  in `package.json` is intentionally short.
- **Zero-cost infra.** GitHub Pages + GitHub Actions only. Don't propose
  Vercel / Netlify / etc. without checking with the user.
- **WebUSB requires HTTPS.** The deploy target is HTTPS; local dev is
  `localhost`. Tests of the real transport must happen against the
  deployed staging URL — there are no devices in CI.
- **High visual fidelity.** Use `oklch()` for new colours — never
  hardcode hex.
- **History is read-only.** Don't rewrite past commit history. The noise
  (co-author footers, session URLs) is intentional; rewriting
  invalidates every existing PR/issue SHA link.
