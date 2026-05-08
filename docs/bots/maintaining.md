---
title: Maintaining bots/
---

# Maintaining `bots/`

This directory is the operational contract for AI agents working on
WebLogcat. Each agent that reads it is also expected to **improve
it** — when you discover a non-obvious gotcha, a missing convention,
or a class of bug other agents have hit, fold the learning back in.
The directory only stays useful if it grows with the codebase.

That said: an unmaintained `bots/` directory rots faster than user
docs because every agent that reads it is also a potential editor.
The rules below are guard-rails against the room collapsing.

## When to update

Update `bots/` when **any** of the following is true:

- You hit a non-obvious gotcha (a selector that needed special
  handling; a hook that fires twice in dev; a build flag whose
  default differs between local and CI). Future agents will hit it
  too. Fold it into the relevant file.
- You discover a convention the existing docs don't mention — e.g.
  "Settings modals always use this hook" — and you have at least
  three concrete examples in `src/` to back it up.
- You add a new piece of agent-runnable infrastructure (a new
  `npm` script, a new contract file, a deploy step that requires
  manual setup). Document it next to the existing equivalents.
- You find a stale or wrong claim and replace it with the corrected
  version (preferring **edit** over **append + contradict**).

Do **not** update `bots/` when:

- You're tempted to record a one-off observation or a personal
  preference.
- The "rule" you'd be writing only applied to the specific PR you
  just shipped (e.g. "in PR #42 we did X" is not a contract).
- It's user-facing — that belongs in `features/`.
- It's contributor-facing prose for humans — that belongs in
  `devs/`.

## Where to write

**Append to an existing file before creating a new one.** Each file
in `bots/` covers a stable concern (the widget contract; doc-sync;
test-sync; the screenshot pipeline; this page). Almost every learning
fits inside one of those. New files multiply the surface a future
agent has to scan before it can act — keep the directory small.

If a learning genuinely doesn't fit any existing file, prefer
extending [the index](./) with a new section over creating a new
top-level page. New top-level pages need a sidebar entry in
`docs/.vitepress/config.ts` and an introduction in [the
index](./) — that overhead is intentional friction.

## Protected directives — do not delete or weaken

The following content is load-bearing. Future agents must not delete,
soften, or rewrite-into-recommendation any of these without an
explicit instruction from the user in the same PR. If you need to
adjust them, **add** an explanatory note alongside; don't replace
them.

- The "doc-sync" contract on [doc-sync.md](./doc-sync) — the rule
  that PRs touching user-facing behaviour must update
  `docs/features/` in the same PR. Removing this is how the docs
  rot.
- The "test-sync" contract on [test-sync.md](./test-sync) — the
  rule that core flows have e2e coverage and that new behaviour
  ships with new tests. Removing this is how the suite rots.
- The "Read these first" pointer block on the [bots/
  overview](./) — the entry point every agent uses. Add to it; do
  not shorten.
- The "Working principles" block on the [bots/
  overview](./) — five short rules. Each was added after a
  concrete failure mode; weakening one re-opens that mode.
- The "Hard constraints" section in
  [`CLAUDE.md`](https://github.com/gabrielhuff/web-logcat/blob/main/CLAUDE.md)
  at the repo root — TS strict, no new runtime deps, zero-cost
  infra, history is read-only, `oklch()` for colours, docs and
  tests stay in sync. These are the project-level invariants.
- The folder layout described in
  [docs-conventions.md](../devs/docs-conventions) — the three
  audience-segmented sections (`features/` users, `devs/`
  contributors, `bots/` agents). Don't merge or rename.
- This list itself.

If you find one of these has been deleted or substantively
weakened, restore it from git history and flag it in the PR.

## Size budget

Each file in `bots/` should stay readable in one sitting. Concrete
budget — measured against the *reading* burden, not raw line count
since tables can be dense:

- A file should be skimmable in under 5 minutes for the relevant
  task. If it isn't, restructure (split sections; move tangents
  into a "see also"; demote prose into tables).
- Aim for ≤ ~400 lines per file. At ~600 lines start splitting.
  This page sits inside the budget; the [widget
  contract](./widgets-contract) is at the upper end and is
  load-bearing — leave it; don't pad it.
- The directory as a whole shouldn't grow past ~6–8 top-level
  pages. If you'd be adding a 9th, you're almost certainly meant
  to be appending to an existing one.

## Style — keep it terse

`bots/` is the *least* polished prose in the docs. Optimise for
"agent succeeds at the task," not "human enjoys the read":

- Tables and bullet lists where they earn their keep. Prose for
  things that don't tabulate cleanly.
- No screenshots, no decorative imagery.
- Imperative voice ("update X"; "don't delete Y") rather than
  hedged advice.
- Concrete file paths and selector names rather than abstract
  references.
- One short sentence per bullet wherever possible.

## What to do if a previous agent made it worse

Agents vary in capability. If you read `bots/` and notice:

- A directive contradicts another directive in the same directory
  → resolve in your PR; flag the contradiction in the description.
- A claim contradicts code you can read → fix the doc to match
  code, or fix code to match doc, depending on which is the actual
  intended behaviour. Surface the call to the user if uncertain.
- A "protected directive" (above) has been deleted or hollowed out
  → restore it from `git log -- docs/bots/` and call it out in the
  PR description.
- The directory has crept past the size budget → don't be afraid
  to *delete*, not just rewrite. A short, accurate `bots/` is
  worth more than a long, decaying one.

When you make any of those repairs, update this file's
[Protected directives](#protected-directives-do-not-delete-or-weaken)
list if the repair revealed a new invariant worth pinning.

## Checklist before shipping a `bots/` change

- [ ] The change is something **future agents** would have wanted
      to know — not a one-off.
- [ ] You appended to an existing page rather than creating a new
      one (unless the new page genuinely doesn't fit).
- [ ] No protected directive was deleted or softened.
- [ ] The file is still ≤ ~400 lines (or you split it).
- [ ] Style is terse: tables / bullets / imperative voice.
- [ ] You added a one-line note in the PR description summarising
      what learning got folded in. (Reviewers won't catch silent
      regressions in agent contracts otherwise.)
