# Session learnings

A scratchpad of operational lessons from running this codebase under
agent-driven development. Each entry captures one specific situation we
hit, what worked, and what to do next time. The end goal is to convert
these into [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills)
— each entry below is sized as one self-contained skill.

## How to read

- **Trigger** — when the entry applies. If the trigger doesn't match
  what you're doing right now, skip the entry.
- **What happened** — the concrete situation, briefly. Future-you may
  not remember; future-other-agent definitely won't.
- **What worked** — the action that resolved it.
- **Recommendation** — the rule to follow next time. This is the
  shape that becomes the skill body.

## How to add an entry

When something teaches you a generalisable lesson — an unexpected
workflow gap, a missing tool, a pattern that paid off — append a new
section using the four-field shape above. Keep entries to ~40 lines.
If a learning grows past that, it probably wants to be split into two.

## How to use during a session

Read the table of contents below before starting work on an unfamiliar
piece of orchestration (multi-PR series, parallel agents, hardware
gating). Skip the per-entry detail unless a trigger matches.

Pointers from this file live in `CLAUDE.md` and `CONTRIBUTING.md`.

---

## Index

1. [Webhook subscription does NOT fire on CI success](#1-webhook-subscription-does-not-fire-on-ci-success)
2. [GitHub auto-merge is the right primitive for hands-off PR landing](#2-github-auto-merge-is-the-right-primitive-for-hands-off-pr-landing)
3. [Sub-agent worktree isolation may not actually isolate](#3-sub-agent-worktree-isolation-may-not-actually-isolate)
4. [Sub-agents can stall silently with no kill switch](#4-sub-agents-can-stall-silently-with-no-kill-switch)
5. [Parallel agents work when file ownership is disjoint](#5-parallel-agents-work-when-file-ownership-is-disjoint)
6. [Plan a long-lived integration branch when the user wants one big review](#6-plan-a-long-lived-integration-branch-when-the-user-wants-one-big-review)
7. [The "decisions surfaced in PR description" pattern](#7-the-decisions-surfaced-in-pr-description-pattern)
8. [Take-over playbook for a stalled sub-agent](#8-take-over-playbook-for-a-stalled-sub-agent)
9. [Pre-flight conventions doc unlocks parallel fan-out](#9-pre-flight-conventions-doc-unlocks-parallel-fan-out)
10. [Playwright tests authored without a real browser need geometry sanity-checks](#10-playwright-tests-authored-without-a-real-browser-need-geometry-sanity-checks)

---

## 1. Webhook subscription does NOT fire on CI success

**Trigger** — you've called `mcp__github__subscribe_pr_activity` on a PR
and you're waiting for "CI all green → I'll merge".

**What happened** — three times in a row I sat idle waiting for a
wake-up that wasn't coming. The PR-activity subscription delivers
webhooks only for **CI failures, review comments, reviews, and merges**.
"in_progress → success" transitions are silent. The user had to ping me
to nudge me back into action.

**What worked** — `mcp__github__pull_request_read` with method
`get_check_runs` polled directly when the contributing sub-agent
reported done. This is reliable but only useful when you have a known
moment to poll.

**Recommendation** — never rely on the webhook alone for the success
path. Combine **(a)** subscription for failure / comment events with
**(b)** an immediate `get_check_runs` poll right after a sub-agent's
task-notification with **(c)** auto-merge for the actual landing. See
entry [#2](#2-github-auto-merge-is-the-right-primitive-for-hands-off-pr-landing).

---

## 2. GitHub auto-merge is the right primitive for hands-off PR landing

**Trigger** — you want a PR to merge without re-prompting the user when
CI passes.

**What happened** — manually polling `get_check_runs` to decide when to
fire `merge_pull_request` works but is fragile (see [#1](#1-webhook-subscription-does-not-fire-on-ci-success)).
GitHub's native **Allow auto-merge** does what we want: enable on the
PR, GitHub merges when required checks pass, and the resulting merge
**does** fire a webhook (verified empirically across PRs #7, #8, #10,
#11, #12, #13).

**What worked** — workflow:

1. Sub-agent finishes; opens PR.
2. `subscribe_pr_activity` so failures still wake the session.
3. **Immediately** `get_check_runs`. If already green, `merge_pull_request`
   directly (saves a round-trip).
4. Otherwise `enable_pr_auto_merge` with method `MERGE`. GitHub queues it.
5. Either auto-merge fires (merge webhook → next phase) or CI fails
   (failure webhook → fix).

**Recommendation** — confirm the **two prerequisites at the start of
the session**, in this order:

- Repository settings → Pull Requests → **Allow auto-merge** ticked.
- Settings → Branches → branch protection rule on the integration
  branch with the required status checks (typically `build` + `e2e`).

If either is missing, ask the user to enable it once at the start; the
30-second setup pays off across every PR in the session. Without
branch protection, `enable_pr_auto_merge` returns "Protected branch
rules not configured for this branch" and the PR sits.

---

## 3. Sub-agent worktree isolation may not actually isolate

**Trigger** — you launched a sub-agent with `isolation: "worktree"` and
expect its filesystem changes to land in the worktree directory.

**What happened** — the Phase 5 agent's worktree at
`.claude/worktrees/agent-<id>/` contained only the design drop-zip
(checked out from a very early commit). The agent silently ignored the
worktree and wrote all its files into the parent checkout. Subsequent
agents did the same. Three of them in flight simultaneously would have
raced if they hadn't been file-disjoint.

**What worked** — explicit instructions in each agent prompt to verify
its CWD up front:

```
STEP 1: Run `pwd && git status && git branch --show-current && ls -la`
immediately. Confirm the working dir contains a real `src/` tree (not
just a zip + README). If it doesn't, abort and report.
```

**Recommendation** — treat `isolation: "worktree"` as best-effort.
Always include the CWD verification step in the prompt. For genuinely
parallel work, also constrain each agent to a strict file-ownership
list (entry [#5](#5-parallel-agents-work-when-file-ownership-is-disjoint)).
Cleanup: at the end of orchestration, run
`git worktree remove -f -f .claude/worktrees/<agent-id>` to drop the
zombie directories.

---

## 4. Sub-agents can stall silently with no kill switch

**Trigger** — a background sub-agent has gone quiet for a long time
(no task-notification, no file activity).

**What happened** — the Phase 7 agent went silent for ~1 hour at ~30%
completion. Its output transcript stopped at a 121-byte stub; only two
of five parsers were on disk; nothing committed. From this side I had:

- No `kill_agent` tool.
- No `SendMessage` tool surfaced in the available toolset (despite
  being mentioned in the Agent docs).
- No process visibility (`ps` returned empty).
- No way to invalidate or replace the agent's context.

The user's UI showed it as "still running" — invisible from inside the
session.

**What worked** — diagnose without polling the transcript file (system
warns against reading it directly):

- `stat` the agent's output file mtime.
- `find src/ -newer <output_file>` to see whether files are still being
  written behind the scenes (file activity is a stronger signal than
  transcript activity).

Then take over from the orchestrator (entry [#8](#8-take-over-playbook-for-a-stalled-sub-agent)).

**Recommendation** — agents don't currently expose lifecycle controls.
Build the orchestration assuming they can stall. Keep a take-over plan.
After ~30 minutes of file-write inactivity, take over directly from the
parent agent rather than waiting; the cost of duplicating ~30% of the
work is lower than the cost of an indefinite stall.

---

## 5. Parallel agents work when file ownership is disjoint

**Trigger** — you're considering running multiple sub-agents
concurrently to compress wall-clock time.

**What happened** — Phases 7 / 8 / 9 of v2 ran in parallel after the
foundation (Phase 5/6) landed. Each phase's *implementation* was
file-disjoint (each owned its widget folder + its `lib/` files). The
*shared touchpoints* were narrow: a one-line flip in
`src/lib/widgets.ts`, a `docs/TASKS.md` checkbox section, the tail of
`src/styles/components.css` (everyone appends), and `tests/smoke.spec.ts`
(everyone adds a case).

`widgets.ts` and `TASKS.md` auto-merged cleanly (different lines /
different sections). `components.css` and `smoke.spec.ts` collided
(same tail), and `lib/layout.ts` collided when two phases edited the
default-layout export. Each conflict took ~2 minutes to resolve
manually at merge time.

**What worked** — accept that parallelism produces conflicts and plan
the merge order. Sequential merges with mechanical conflict resolution
were strictly faster than running serially.

**Recommendation** — checklist before launching parallel agents:

- [ ] Each agent's prompt names a strict **file ownership list** ("you
      may modify A, B, C; you may not modify D, E, F").
- [ ] Identify the **shared touchpoints** in advance (registries,
      default-layout, append-only files). Tell each agent how to edit
      them in a way that minimises collisions (one line per kind, not
      a wholesale rewrite of the structure).
- [ ] Decide the **merge order** in advance (usually whichever phase
      *overwrites* a shared file should land last; whichever just
      *adds an entry* can land in any order).
- [ ] Plan to do the merge yourself with `rebase`-and-resolve rather
      than relying on auto-merge for conflicting branches.

---

## 6. Plan a long-lived integration branch when the user wants one big review

**Trigger** — the user prefers one comprehensive code review at the
end of a multi-PR series rather than gating each step.

**What happened** — at the start of v2, the user said "merge all PRs
to a temporary `v2` branch; I'll do a big review on `v2 → main` once
everything is done." This shaped every subsequent decision: each phase
PR's base was `v2`, not `main`; auto-merge to `v2` was safe to
automate; `main` stayed pristine for the final review.

**What worked** — explicit one-time setup at the start of the chain:

1. Create the integration branch from current `main`.
2. Re-target any open PRs from `main` → `v2` via
   `mcp__github__update_pull_request`.
3. Add branch protection on `v2` with the required status checks (so
   `enable_pr_auto_merge` works).
4. Every sub-agent's prompt says **base = `v2`**, NOT `main`, and is
   reminded that the user does the big review at the end.
5. Once the chain finishes, open one final `v2 → main` PR with a
   comprehensive description (summary, what to look at first,
   follow-ups, deps added).

**Recommendation** — prompt the user up front about review preference
when the work decomposes into more than ~3 PRs. If they want the big-
review pattern, use a long-lived branch and document the pattern in the
final `v2 → main` PR description so the reviewer knows what to expect.

---

## 7. The "decisions surfaced in PR description" pattern

**Trigger** — a sub-agent hits ambiguity in the spec and has to make a
judgement call.

**What happened** — every contributing PR in v2 included a "Decisions
surfaced" section listing each ambiguous call (typically 3–6 per PR).
Examples: "ANSI silently stripped (no xterm.js)", "default layout is
one full-width Logcat tile in Phase 5 because rendering 3 disabled
stubs would be ugly", "scrcpy-server v2.7 + ya-webadb 2.3.x
compatibility pair documented at top of `lib/scrcpy.ts`".

**What worked** — instructed every sub-agent prompt: *"If you hit
ambiguity, make the most reasonable call AND document it in the PR
description as `Decision X: ...`."* This produced a clean audit trail.
At review time the user only had to look at the decisions list to see
what was non-obvious.

**Recommendation** — every implementation-phase prompt should include
this instruction. Costs nothing; produces a self-documenting trail
that makes review faster and rollbacks easier. Do *not* let an agent
silently guess at ambiguity without recording the choice.

---

## 8. Take-over playbook for a stalled sub-agent

**Trigger** — you've decided a sub-agent is stalled (entry
[#4](#4-sub-agents-can-stall-silently-with-no-kill-switch)) and want
to finish its work yourself.

**What happened** — Phase 7 took over. Steps that worked:

1. **Inspect** what's on disk: `git status` to see uncommitted files;
   `stat -c '%y %n' <files>` to see the latest mtime; `git branch
   --show-current` to confirm the agent's branch.
2. **Salvage** the partial work as the first commit on the agent's
   branch. Don't restart — the agent's existing code is usable.
3. **Read** the design source, conventions doc, and 2–3 example
   already-shipped components for tone-matching before writing a line.
4. **Write** the missing pieces. Honour the agent's already-established
   types and naming patterns.
5. **Rebase against the integration branch** before opening the PR —
   parallel sibling agents may have landed in the meantime.
6. **Quality gates** + **PR** + **auto-merge** as if the original
   agent had finished.

**Recommendation** — when you're orchestrating and a sub-agent stalls,
the take-over flow above takes 30–60 minutes for a phase-sized task.
That's almost always faster than relaunching a fresh sub-agent (which
risks the same stall). Don't let sunk-cost fallacy make you wait for a
dead agent.

---

## 9. Pre-flight conventions doc unlocks parallel fan-out

**Trigger** — you're about to launch multiple sub-agents that will
each port a similar feature (widget, plugin, parser, etc.).

**What happened** — Phase 5 (the foundation phase) dropped
`docs/WIDGETS.md` documenting how to register a kind, how to use
`useAdb()`, the `widget-bar` class convention, and the per-widget
folder layout. The four parallel widget agents (Shell, Dumpsys, Files,
Mirror) pattern-matched against this doc instead of re-deciding
conventions per agent. Result: code style stayed consistent across
agents that never saw each other.

**What worked** — explicit cost in Phase 5 (~30 lines of
documentation) saved hours of code review noise across Phases 6–9.

**Recommendation** — when planning a multi-phase feature, the *first*
phase should produce a conventions document covering everything the
later phases need to pattern-match. Tell the foundation-phase agent
this is part of the deliverable. List what it should cover.

---

## 10. Playwright tests authored without a real browser need geometry sanity-checks

**Trigger** — a sub-agent reports it added Playwright tests in an
environment that couldn't install Chromium for verification.

**What happened** — Phase 10 added six dashboard-interaction tests
without being able to run them. Three failed on CI:

- A drag test that moved the wrong direction (target tile pinned
  against the right edge; rightward drag clamped to no-op).
- A resize test on the same right-edge tile (no room to grow).
- A scrim-click test that defaulted to the dialog's centre — landing
  on a palette card instead of the backdrop.

All three were valid Playwright assertions defeated by **specific
geometry of the page being tested**.

**What worked** — diagnose by reading the failing test names + the
default layout's grid coordinates. Each fix was a 1-line change once
the geometry was understood.

**Recommendation** — when a sub-agent ships browser tests it couldn't
run locally:

- Have the orchestrator (or a lightweight reviewer agent) walk through
  every test against the page's actual default state. Pay specific
  attention to: **edge-pinned elements** (drags / resizes), **stacked
  layers** (default `click()` lands at element centre), and
  **viewport bounds** (large mouse-deltas can leave the page).
- Have the agent's prompt include this pre-flight check explicitly
  rather than relying on CI to surface it.
