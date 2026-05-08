# Deployment

## Topology

GitHub Pages, two environments served from the same Pages site:

| Environment | App URL                                         | Docs URL                                                  | Source branch | Triggered by       |
| ----------- | ----------------------------------------------- | --------------------------------------------------------- | ------------- | ------------------ |
| Staging     | `https://<owner>.github.io/web-logcat/staging/` | `https://<owner>.github.io/web-logcat/staging/docs/`      | `main`        | every push         |
| Production  | `https://<owner>.github.io/web-logcat/`         | `https://<owner>.github.io/web-logcat/docs/`              | `release`     | every push / merge |

Both environments are HTTPS by default — required for WebUSB. The docs
site is a separate [VitePress](https://vitepress.dev/) app emitted into
`dist/docs/`, so it ships in the same publish step as the main app.

## How it works

The `gh-pages` branch is the published-site source of truth.
[`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages)
writes into a subdirectory keyed by the triggering branch:

- Push to `main` → build the app with `BASE_PATH=/web-logcat/staging/`
  and the docs with `DOCS_BASE_PATH=/web-logcat/staging/docs/` → deploy
  to `gh-pages:/staging/`. `keep_files: false` so stale staging assets
  are cleaned. The branch root is untouched.
- Push to `release` → build the app with `BASE_PATH=/web-logcat/` and
  the docs with `DOCS_BASE_PATH=/web-logcat/docs/` → deploy to
  `gh-pages:/` (root). `keep_files: true` so the existing `/staging/`
  subtree is preserved. Stale production assets aren't pruned, but
  Vite's hashed filenames keep the bloat bounded.

Both builds happen via `npm run build:all`, which runs the app build
followed by the docs build. The docs output lands at `dist/docs/`,
which the publish step picks up alongside the rest of `dist/`.

Workflow lives in [`.github/workflows/deploy.yml`](https://github.com/gabrielhuff/web-logcat/blob/main/.github/workflows/deploy.yml).

## One-time setup

In the repo's GitHub UI:

1. **Settings → Pages**
   - Build and deployment → Source = **Deploy from a branch**
   - Branch = `gh-pages`, folder = `/` (root). Save.
2. The first `main` push will create the `gh-pages` branch and populate
   `/staging/`. The first `release` push will populate the root.
3. (Optional) **Settings → Environments** → add `staging` and `production`
   environments. Add manual approval to `production` if desired.

## Promoting staging → production

```bash
git checkout release
git merge --ff-only main
git push origin release
```

If `release` doesn't exist yet:

```bash
git checkout -b release main
git push -u origin release
```

## Troubleshooting

- **404 after first staging deploy** — Pages can take a minute to build
  the first time. Check the Deploy workflow run; if it succeeded, wait.
- **WebUSB chooser empty on the deployed site** — make sure you're on
  HTTPS, the device is unlocked, USB debugging is enabled, and you've
  accepted the on-device authorisation prompt.
- **Stale prod assets piling up** — once a year (or whenever it bothers
  someone), force-rebuild prod with a clean tree by deleting `gh-pages`
  branch and re-running both deploys.
- **Docs 404 after a rename** — VitePress's `cleanUrls` strips the
  `.html` suffix in URLs. If you renamed a feature page, sweep the
  inbound links and re-deploy; the previous URL won't redirect.

## Why GitHub Pages and not X?

- **Cost:** $0 for public repos. Cloudflare Pages and Vercel hobby tiers
  are also $0 but they require a separate account and tie us to a vendor.
  Pages keeps everything inside GitHub.
- **Preview environments per PR:** not supported by Pages directly.
  We chose a `main → staging`, `release → production` split instead. If
  per-PR previews become important, switch to Cloudflare Pages
  (free, supports them out of the box) — the build artefact is the same.
