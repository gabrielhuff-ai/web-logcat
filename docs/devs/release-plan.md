# Release plan: alpha → beta → GA

This is the operational plan for moving WebLogcat from "alpha" (small
private testing group) to "beta" (broader public sharing — Reddit,
HN-style channels) to general availability (drop the beta pill, ship
v1.0). It's written so a human can follow it directly *and* so an
agent can be pointed at a single phase and execute it.

The repo currently sits in **alpha**. The pre-release cleanup pass is
done.

---

## Quick reference for an agent

If a human asks you to "do the alpha release prep", or "promote to
beta", or anything else release-shaped, this document is the
authoritative checklist. Each phase has:

- A **goal** (what state the repo ends in).
- A **prerequisites** block (anything that must already be true).
- A **steps** list, marked `[code]` (you can do it directly via
  PR/commit), `[infra]` (GitHub UI / settings — needs the human),
  or `[external]` (announcements / outreach — needs the human).

Always:

- Land each phase as a single small PR where possible.
- Don't bump the version manually if it's just a bug-fix; the
  `version-bump.yml` workflow handles patch versions automatically on
  every push to `main`. **Major / minor bumps are explicit edits to
  `package.json`** and only happen at the phase boundaries below.
- Don't open a PR labeled "alpha → beta promotion" unless every box
  in the **Beta prerequisites** is ticked.

If a step says `[infra]` or `[external]` and the human hasn't done
it, *don't* try to do it for them via a roundabout path (e.g. don't
push a workflow that scrapes Reddit). Surface that the step needs
their action and pause.

---

## Phase 0 — Pre-release cleanup (done)

This is recorded for completeness; the actions are already on `main`.

- [x] Repo audited for committed secrets / personal info (none found).
- [x] `LICENSE` file exists at the root (MIT, matching `package.json`).
- [x] Internal-only dev docs removed:
  - `docs/TASKS.md` (superseded by GitHub Issues).
  - `docs/LEARNINGS.md` (operational notes from initial development).
  - `design/` (handoff prototypes — historical reference, no longer
    needed).
- [x] Public docs reorganised into a published site:
  - `README.md` is user-first (live URL, supported browsers,
    one-line pitch, screenshot, pointer to the docs site).
  - `docs/` is a VitePress app published at `<base>/docs/` with three
    audience-segmented sections: `features/` for end users, `devs/`
    for contributors (this page included), and `bots/` for AI agents.
  - `CLAUDE.md` at the root is the agent entry-point and points into
    `docs/bots/` for the operational contracts.
- [x] CI surface in place:
  - `ci.yml` (typecheck / lint / unit / build / e2e on every PR).
  - `version-bump.yml` (auto-increments patch on `main` pushes via
    PR + auto-merge).
  - `deploy.yml` (publishes `main` → staging, `release` → prod).
  - `promote.yml` (manual `workflow_dispatch` button to fast-forward
    `release` to `main`).
- [x] Issue templates: `bug_report.md`, `feature_request.md` under
  `.github/ISSUE_TEMPLATE/`. Drop them into the repo if missing —
  they collect structured reports during alpha/beta.

---

## Phase 1 — Alpha (current)

**Goal:** small private cohort uses the staging URL and reports back.

### Prerequisites

- [x] Phase 0 boxes all ticked.
- [x] The transferred repo's GitHub side is fully wired up: `BOT_PAT`
  recreated, Pages re-enabled, "Allow auto-merge" ticked, ruleset
  bypass actor verified, `release` ruleset created (block force
  pushes + restrict deletions).
- [x] At least one end-to-end test pass on a real Android device by
  the maintainer.

### Steps

1. `[infra]` Create or pin a GitHub Discussion / pinned Issue titled
   "Alpha feedback" containing:
   - the staging URL,
   - supported browsers (Chromium-only, WebUSB),
   - a "what to try" list (each widget, drag-to-repivot, pairing on
     a real device, log streaming, etc.),
   - a pointer to the bug-report template for issues.
2. `[external]` Hand-pick the alpha cohort (5–15 people who'll
   actually plug in a real device and report). Send them the URL +
   the "what to try" list directly.
3. `[code]` Iterate on feedback as PRs against `main`. Patch bumps
   land automatically. Promote to `release` (and therefore to
   production) via the **Actions → Promote main to release** workflow
   when the maintainer is satisfied with a checkpoint.

Don't:

- Add analytics / telemetry in alpha. Direct feedback at this scale
  is enough and avoids consent friction.
- Open this up to broader audiences (Reddit etc.) until the **Beta
  prerequisites** are all ticked.

### Exit criteria (when to consider promoting to beta)

- [ ] No P0 bugs reported in the last 2 weeks.
- [ ] All five widgets exercised on at least one real Pixel /
      Galaxy / similar Android 13+ device by someone other than the
      maintainer.
- [ ] No outstanding issues marked `release-blocker`.

---

## Phase 2 — Beta (broader sharing)

**Goal:** the app is shared on Reddit / HN-style channels and absorbs
public feedback.

### Prerequisites

- [ ] All Phase 1 exit criteria ticked.
- [ ] A short launch post draft exists (paragraph + one screenshot +
      link).

### Steps (agent-runnable)

1. `[code]` Replace the alpha branding with beta:
   - In `src/components/Dashboard.tsx`, change the `dash-brand-beta`
     pill text from `alpha` to `beta` (and the `aria-label` from
     `Alpha release` to `Beta release`). The CSS class stays
     `dash-brand-beta` — don't churn the styling.
   - In `src/components/EmptyState.tsx`, change the `empty-alpha`
     pill the same way.
   - One PR, simple commit.
2. `[code]` Bump the version to a meaningful minor in
   `package.json` — e.g. `0.5.0`. The auto-patch-bump will continue
   from there. Land in the same PR as the branding change so the
   `package.json` version and the visible pill agree from one
   commit forward.
3. `[infra]` Optionally enable GitHub Discussions on the repo for
   free-form Q&A (Settings → General → Features → Discussions).
4. `[external]` Pin a "Beta feedback" issue / discussion replacing
   the alpha one — same structure, broader audience.
5. `[external]` Post the launch announcement. Primary: r/androiddev.
   Optional secondaries: r/webdev, Hacker News' Show.
6. `[code]` (optional) Wire in privacy-respecting analytics if you
   want a sense of scale — Plausible, Umami, or a tiny Cloudflare
   Worker counter. Add a one-line note to the README disclosing it.
   Skip if you'd rather not.

Don't:

- Bump straight to `1.0.0` from beta. Keep major reserved for the
  GA boundary so users have a clear "stable" signal to look for.
- Remove the beta pill until **Phase 3** runs.

### Exit criteria

- [ ] 30 days with no P0/P1 bugs.
- [ ] At least 3–5 people other than the maintainer have used the
      app on real hardware and reported back.
- [ ] All five widgets exercised in the wild (cumulative).
- [ ] No outstanding issues marked `release-blocker`.

---

## Phase 3 — GA (1.0)

**Goal:** beta pill removed, version is `1.0.0`, the app is "stable"
in the README sense.

### Prerequisites

- [ ] All Phase 2 exit criteria ticked.

### Steps (agent-runnable)

1. `[code]` Remove the release pill from both surfaces:
   - In `src/components/Dashboard.tsx`, delete the
     `<span className="dash-brand-beta">…</span>` element.
   - In `src/components/EmptyState.tsx`, delete the
     `<span className="empty-alpha">…</span>` element.
   - Drop the `.dash-brand-beta` and `.empty-alpha` CSS rules
     (they have no other consumers).
2. `[code]` Bump the version to `1.0.0` in `package.json`. The
   auto-bump moves on as `1.0.1`, `1.0.2` from there.
3. `[code]` Update `README.md`:
   - Drop any "alpha"/"beta"/"experimental" disclaimers.
   - Add a stable-version badge if desired (shields.io
     `version-1.0.0-blue`, or just remove the pre-release tone).
4. `[code]` Create `CHANGELOG.md` (or use GitHub Releases — same
   thing). Cut a `v1.0.0` release with a curated highlights list of
   the alpha + beta work. Link to it from the README.
5. `[external]` Tag the GitHub Release; consider a follow-up post
   on the same channels you used at beta launch.

Don't:

- Drop backward compatibility for the `?d=` URL state format —
  shared URLs are now public surface. Keep `decode()`'s legacy
  shape acceptance.

### Exit criteria

- [ ] `package.json` version starts with `1.`.
- [ ] No `alpha`/`beta` text in the rendered UI.
- [ ] `v1.0.0` GitHub Release exists.

---

## Things to keep in mind across all phases

- **Don't change the repo URL again** between alpha and 1.0. Every
  reshare you do compounds the redirect debt; pick the final owner
  before alpha if at all possible.
- **Auto-bump policy:** keep the patch bump on every `main` commit.
  Major / minor are manual at the phase boundaries above.
- **Backwards-compatible URL state:** the `?d=` payload is now a
  public surface. `decode()` already accepts the legacy `{ layout,
  tileSettings }` shape — keep that compatibility through 1.0 and
  ideally beyond.
- **History is read-only:** never rewrite past commit history to
  clean up co-author / session-URL footers. They're noise but
  rewriting invalidates every existing PR/issue link to a SHA, and
  that's a worse trade-off.
