---
description: Graphite-native PR drain — enroll clean PRs into the merge queue, fan out worktree fix agents for the rest, never go red
allowed-tools: Bash(gh:*), Bash(git:*), Bash(pnpm:*), Bash(jq:*), Bash(bash:*), Bash(chmod:*)
---

# Drain — Graphite merge queue to zero

Clears the open-PR backlog the way the repo actually ships now: agents open PRs
straight to `main`, the **Graphite merge queue** rebase-merges them server-side,
and the queue **re-tests each PR against latest `main` before landing** — so the
queue, not this command, is what keeps `main` green.

## Hard rules (current CI — do not violate)

- **Never `gh pr merge` / `--auto` / `--admin`.** Branch protection lets only the
  Graphite app push to `main`; those calls fail and bypass the queue.
- **Enroll = add the `merge-queue` label.** That is the only way a PR enters the queue.
- **`fast` is emergency/hotfix-only.** Ordinary generated PRs on `codex/*`,
  `claude/*`, `agent/*`, or similar branches must not use `fast` unless the PR
  is explicitly classified as emergency/hotfix/incident; otherwise the guard
  removes `fast` and gates the PR for human review.
- **Dequeue hard gates = remove only the `merge-queue` label.** A PR with
  `needs-human`, `hold`, or `gated` must not keep occupying Graphite MQ slots.
- **Never retarget to `integration/loop-*`.** That model is dormant; agents go to `main`.
- **Never close a PR you didn't open.** Surface superseded/stale ones to the human.
- **Never touch `gtmq_*` draft PRs** (author `app/graphite-app`) — that's the queue working.
- **Opt-outs:** `needs-human`, `hold`, `gated` → leave the PR for a human after
  removing `merge-queue` if it was already enrolled.

## Phase 0 — Classify + enroll the clean bucket

```bash
DRY_RUN=1 DRAIN_MAX_SECONDS=900 bash scripts/drain-pr-queue.sh   # preview for at most 15 minutes
DRAIN_MAX_SECONDS=900 bash scripts/drain-pr-queue.sh             # apply; defer remainder at the budget
```

`DRAIN_MAX_SECONDS` defaults to `900` (15 minutes). The script checks the budget
before each per-PR GitHub operation, so a scheduled drain cannot expand without
bound as the backlog grows. A single in-flight API call may finish after the
budget; the next operation is deferred to the next tick.

The script enrolls every non-draft, `MERGEABLE`, green, non-opted-out PR and
prints five work buckets: **DEQUEUE**, **CONFLICT**, **BLOCKED**, **SURFACE**,
**GRAPHITE MQ**.

## Phase 1 — Kill systemic blockers first

If the same required check fails on **3+ PRs**, it's broken on `main`, not in the
branches. Fix it once on `main` via a single PR, then add `merge-queue` so
Graphite retests and lands it ahead of downstream work. Add `fast` only when
the PR is explicitly emergency/hotfix/incident-classified; otherwise use the
Graphite dashboard's merge-now path for human-approved emergency bypass. Don't
fix the same thing on N branches.

```bash
# failing-check histogram across open PRs
gh pr list --state open --limit 100 --json number,statusCheckRollup --jq '
  [.[] | .statusCheckRollup[]?
    | select(.completedAt != null and .completedAt != "0001-01-01T00:00:00Z")
    | {name: (.name // .context), conclusion: (.conclusion // ""), completedAt: .completedAt}
    | select(.name != null and .name != "")
  ]
  | group_by(.name) | map(sort_by(.completedAt) | last)
  | map(select(.conclusion | test("FAILURE|TIMED_OUT|ACTION_REQUIRED")))
  | map(.name)
  | group_by(.) | map({check: .[0], prs: length}) | sort_by(-.prs) | .[]'
```

## Phase 2 — Fan out worktree fix agents (tiered models)

For each PR in the **CONFLICT** and **BLOCKED** buckets, spawn ONE Agent with
`isolation: "worktree"` and `mode: "bypassPermissions"`. **Send all spawns in a
single message** so they run in parallel. Pick the model by task:

- **Haiku** (cheap, mechanical): rebase a `CONFLICTING` branch whose conflicts are
  lockfiles / imports / generated files; fix a failing unit/lint/type check that's
  a clear mechanical break.
- **Opus** (judgment): semantic merge conflicts (overlapping logic), test failures
  that need reasoning about intent, anything touching auth/billing/migrations, or
  any PR a Haiku agent returned `BLOCKED_SEMANTIC` on.

Each agent's prompt must be self-contained and instruct it to:
1. In its worktree, `git fetch origin && git checkout <head>` then `git rebase origin/main`.
2. Resolve conflicts **preserving PR intent**. If a conflict needs non-trivial
   semantic judgment and the agent is the cheap tier → stop and report
   `BLOCKED_SEMANTIC` with the conflicting hunks (do not guess).
3. Run focused local verify: `pnpm --filter @jovie/web run typecheck`,
   `pnpm biome check apps/web`, and the specific failing test files.
4. Fix root causes (not the test, unless the test is wrong).
5. `git push --force-with-lease` to the PR's head branch. **Never push to `main`.**
6. Add the `merge-queue` label (`gh pr edit <n> --add-label merge-queue`). **Never `gh pr merge`.**
7. Report `DONE` / `BLOCKED_SEMANTIC` / `BLOCKED_OTHER` with the reason.

Re-dispatch any `BLOCKED_SEMANTIC` returns to an Opus agent. After agents return,
re-run Phase 0 to enroll anything now green.

## Phase 3 — Surface, don't act

For the **SURFACE** bucket (`needs-human`, `hold`, `gated`) and any
duplicate/superseded PRs, **report to the human with a recommendation** — do
not close or merge. The drain strips `merge-queue` from hard-gated PRs before
surfacing them. Detect dupes:

```bash
gh pr list --state open --json number,title --limit 100 \
  | jq -r 'group_by(.title)[] | select(length>1) | "DUP: \(.[0].title) -> \([.[].number])"'
```

## Phase 4 — Report

```markdown
## Drain Results
- Enrolled into queue: <n> (#…)
- Fix agents dispatched: <n> (DONE: …, still blocked: …)
- Surfaced for human: <n> (#… — recommend close/keep + why)
- Graphite MQ in-flight: <n> groups
- Systemic blockers fixed on main: <…/none>
- Last merge: <ts>  | Open PRs: <n>
```

Flow-health targets: nothing non-draft sits unenrolled; no agent PR open >24h
without a push; if a labeled PR isn't entering the queue, the `merge-queue` →
Graphite enrollment wiring is broken — flag it.

If a Graphite draft gets stale after a downstack MQ draft closes, first resubmit
the source PR with `gt submit --always --update-only --no-edit --no-interactive
--no-verify`. If the stale `gtmq_*` draft remains, use the Graphite dashboard
to cancel/retry the queue entry. Do not close `gtmq_*` PRs from GitHub.
