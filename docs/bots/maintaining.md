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

## When to remove or trim

`bots/` decays if it only ever grows. **A shorter, accurate
directory is worth more than a long, decaying one** — be willing to
delete, not just rewrite. Remove or trim content when **any** of the
following is true:

- **The claim is wrong.** A directive contradicts the code as it
  ships today. Read the code; either fix it to match the doc, or
  delete the doc. Don't leave both versions in place hoping a
  reviewer notices.
- **The advice is obsolete.** A "watch out for X" warning whose
  underlying cause has been fixed (a dependency upgrade, a
  refactor, a deprecated API removed). Future agents will read it
  and waste effort handling a problem they don't have.
- **The "rule" was always a one-off.** A line that documents a
  specific PR's choice rather than a general invariant.
  ("In PR #42 we used Y" — delete.) The git history is the right
  place for those.
- **It's duplicated.** The same directive appears in two files.
  Keep one canonical copy; replace the other with a one-line
  pointer (`see [X](./x)`) or delete entirely if the pointer adds
  nothing.
- **The matching code was removed.** A widget contract section
  references a deleted helper or a CSS class no widget carries any
  more. The doc must follow.
- **The page exceeded its budget for a non-load-bearing reason.**
  Tangents, rationale paragraphs, "by the way" notes that aren't
  contracts — fair game for cutting. Keep imperative directives;
  cut explanatory prose if it isn't earning its lines.
- **A previous agent made it worse.** See the [recovery
  section](#what-to-do-if-a-previous-agent-made-it-worse) below.

How to remove safely:

1. **Check the [protected directives list](#protected-directives--do-not-delete-or-weaken)
   first.** If what you're about to remove is on it, stop — restore
   from git history instead and flag in the PR. If what you're
   removing is itself a protected-directive entry, it must not
   leave; only the *content describing* that entry can be edited
   for clarity.
2. **Grep for inbound links.** A directive may be referenced by
   `CLAUDE.md`, `devs/docs-conventions.md`, or a sibling page in
   `bots/`. Update or remove those references in the same diff so
   the docs site doesn't ship dead links.
   ```bash
   git grep -n 'old-thing'
   ```
3. **Prefer edit over delete-and-rewrite.** If a directive needs
   sharpening, edit it in place — don't add a contradicting one
   below and leave the original. `git log -p docs/bots/<file>.md`
   should read as a coherent series of refinements, not a stack of
   half-corrected positions.
4. **Summarise the cut in the PR description.** One line, e.g.
   `Removed obsolete WebUSB-on-localhost note — fixed in @yume-chan/adb 2.6.`
   Reviewers can't catch silent regressions in agent contracts
   otherwise.
5. **If you're unsure, ask.** Removal is harder to undo than
   addition — when in doubt, surface the call to the user rather
   than guessing.

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
      to know (additive change) — or actively wastes their time
      today (trim/remove change). Not a one-off.
- [ ] If adding: you appended to an existing page rather than
      creating a new one (unless the new page genuinely doesn't
      fit).
- [ ] If removing: you grepped for inbound links and updated or
      cleaned them up in the same diff.
- [ ] No protected directive was deleted, softened, or moved.
- [ ] The file is still ≤ ~400 lines (or you split it). Be
      especially willing to cut explanatory prose to stay under
      budget — keep imperative directives.
- [ ] Style is terse: tables / bullets / imperative voice.
- [ ] You added a one-line note in the PR description summarising
      what learning got folded in *or* what was cut and why.
      Reviewers won't catch silent regressions in agent contracts
      otherwise.
