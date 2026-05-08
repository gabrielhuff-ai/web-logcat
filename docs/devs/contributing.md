# Contributing guide

This is a small repo with a clear scope, so the rules are short.

## Branches

- `main` — integration branch. Every push deploys to **staging**:
  `https://<owner>.github.io/web-logcat/staging/`.
- `release` — production branch. Pushes (typically fast-forward merges
  from `main` after smoke-testing on staging) deploy to:
  `https://<owner>.github.io/web-logcat/`.
- Feature work happens on `claude/<topic>` or `feature/<topic>` branches
  and lands via PR into `main`.

## Pull requests

- CI must pass (`npm run typecheck`, `npm run lint --max-warnings 0`,
  `npm test`, `npm run build`, `npm run e2e`).
- Keep PRs small and focused. The component scaffolding in
  `src/components/` is intentionally split so each component can be
  ported in its own PR.
- New or changed user-facing behaviour comes with a docs update — see
  [docs conventions](./docs-conventions). Reviewers will push back if
  the [features pages](../features/) drift from the shipped UI.
- Core flows are exercised by tests — see
  [test-sync rules](../bots/test-sync). New widgets / behaviours
  introduce or extend their corresponding unit + e2e coverage in the
  same PR.

## Promoting staging → production

```bash
git checkout release
git merge --ff-only main
git push origin release
```

The `release` push triggers `.github/workflows/deploy.yml` and updates
the production URL while preserving `/staging/`. The same workflow
publishes the docs at `<base>/docs/`.

## Local development

```bash
npm install
npm run dev          # main app on http://localhost:5173
npm run docs:dev     # docs site on http://localhost:5174
```

Notes:

- WebUSB requires HTTPS or localhost. `npm run dev` binds to localhost
  so it works without certs, but the real ADB code path can only be
  exercised on the deployed Pages site (or with a local HTTPS dev
  cert).
- The simulated stream is enabled via the **Use simulated data** button
  on the empty state.
- The docs are a separate VitePress app — building or running them is
  fully decoupled from the main Vite app, so you can edit Markdown
  without restarting the dashboard dev server.

## Code style

- TypeScript strict mode.
- Functional components, hooks. State lives in `App.tsx` until a clear
  reason to extract it appears (no premature contexts / stores).
- CSS custom properties only — don't introduce CSS-in-JS or a utility
  framework. The token system in `src/styles/tokens.css` is the
  contract.
- `oklch()` for new colors so they stay perceptually consistent across
  themes; do not hardcode hex.
