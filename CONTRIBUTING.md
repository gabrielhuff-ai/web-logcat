# Contributing

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

- CI must pass (`npm run typecheck` + `npm run build`). Lint is currently
  warn-only — see `package.json` to flip `--max-warnings 0` once the
  codebase is fully ported.
- Keep PRs small and focused. The component scaffolding in `src/components/`
  is intentionally split so each component can be ported in its own PR.
- Reference the relevant design source (`design/v2/source/<file>.jsx` for
  new dashboard / widget work, `design/v1/source/<file>.jsx` for changes
  inside the already-ported logcat internals) in the PR description when
  you port one of the stubs.

## Promoting staging → production

```bash
git checkout release
git merge --ff-only main
git push origin release
```

The `release` push triggers `.github/workflows/deploy.yml` and updates the
production URL while preserving `/staging/`.

## Local development

```bash
npm install
npm run dev
```

Notes:

- WebUSB requires HTTPS or localhost. `npm run dev` binds to localhost so
  it works without certs, but the real ADB code path can only be exercised
  on the deployed Pages site (or with a local HTTPS dev cert).
- The simulated stream is enabled via the **Use simulated data** button on
  the empty state.

## Code style

- TypeScript strict mode.
- Functional components, hooks. State lives in `App.tsx` until a clear
  reason to extract it appears (no premature contexts / stores).
- CSS custom properties only — don't introduce CSS-in-JS or a utility
  framework. The token system in `src/styles/tokens.css` is the contract.
- `oklch()` for new colors so they stay perceptually consistent across
  themes; do not hardcode hex.
