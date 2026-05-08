# Docs conventions

The documentation site lives under `docs/`. It's published as a separate
VitePress app at `<app>/docs/` (production:
`https://gabrielhuff.github.io/web-logcat/docs/`).

## Layout

```
docs/
├── .vitepress/config.ts          # navigation, sidebar, base path, theme
├── public/                       # static assets (favicon, hero PNG)
├── index.md                      # landing page
├── features/                     # user-facing product docs
│   ├── index.md
│   ├── img/                      # screenshots referenced from features/*.md
│   └── <feature>.md
├── devs/                         # contributor / human reference (this section)
│   ├── index.md
│   └── <topic>.md
└── bots/                         # agent-only contracts (intentionally terse)
    ├── index.md
    └── <topic>.md
```

The three top-level sections have different audiences and different
expectations of polish:

| Section | Audience | Tone |
| --- | --- | --- |
| `features/` | End users (developers using WebLogcat against their own devices) | Polished, illustrated, focused on usage and behaviour. No design / internals. |
| `devs/` | Contributors — humans + bots that benefit from prose | Reference, lightly polished. Architecture, deploy, release procedure. |
| `bots/` | AI agents working in the repo | Terse contracts. No screenshots, no fluff — the goal is *agent succeeds at the task*, not *human enjoys the read*. |

## Writing style

- Sentences over checklists where the prose is short. Tables and bullet
  lists when the structure earns its keep.
- Code blocks use the language tag (` ```ts `, ` ```bash `) so
  VitePress syntax highlighting kicks in.
- Internal links use the relative path *without* the `.md` suffix
  (`./logcat`, `../bots/widgets-contract`) — VitePress's `cleanUrls`
  is on.
- The "Open WebLogcat" link in the navbar is automatic — don't sprinkle
  absolute production URLs through the prose. If you must, point at the
  staging URL so writing on `main` doesn't ship a link the reader can't
  yet hit.

## Screenshots

Feature pages live or die on screenshots. The convention:

- Feature shots live under `docs/features/img/<slug>.png`. Reference
  them with relative paths: `![alt](./img/<slug>.png)`.
- One canonical hero shot per feature, plus task-specific shots if a
  flow is non-obvious. Keep PNGs under ~250 KB; prefer 2× device-pixel
  resolution for crispness.
- Most shots come out of `scripts/capture-feature-screenshots.ts` —
  a Playwright script that drives the
  [simulator](../features/simulator) and snapshots each widget. Run
  `npm run docs:screenshots` after a UI change that affects how the
  rendered shot looks; review the diff in the PR.
- Real-device-only flows (Mirror's live frame, Files transfers, the
  WebUSB pairing dialog) cannot be captured by the script. Use a real
  device and commit the static PNG; flag the source in the alt-text.
- Avoid embedding live device serials, IPs, or other personally
  identifying information. The simulator's defaults are safe; if you
  capture against a real device, redact the serial in the device pill.

## Keeping docs in sync with the app

> **Contract.** Every PR that changes user-facing behaviour updates the
> matching feature page in the same PR. Reviewers will block merges that
> drift.

Concretely:

- Adding a widget kind → new `docs/features/<kind>.md`, plus a row in
  `docs/features/index.md` and a sidebar entry in `.vitepress/config.ts`.
- Renaming a UI control / shortcut → grep `docs/features/` for the old
  name and update.
- Removing a feature → delete the page, drop its sidebar entry, sweep
  inbound links.
- Changing the appearance / layout of a tile → re-run
  `npm run docs:screenshots` and review the captured PNG before
  committing.

The agent-facing version of this contract lives at
[bots/doc-sync](../bots/doc-sync) — it's the one a bot will read first.

::: tip Editing the agent contracts themselves
The `bots/` directory is meant to grow with the codebase as agents
fold their learnings in. The rules for doing that safely (what to
update, what's load-bearing, the size budget) live in
[bots/maintaining](../bots/maintaining). Read it before pushing
changes under `bots/`.
:::

## Building locally

```bash
npm run docs:dev      # dev server on http://localhost:5174
npm run docs:build    # build into dist/docs/
npm run docs:preview  # preview the built output
```

The production build is part of the `deploy` workflow's
`build:all` step — see [deployment](./deployment).
