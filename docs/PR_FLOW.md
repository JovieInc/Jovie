# PR Flow — How Agents Ship (Canonical)

The single source of truth for how code reaches `main`. The goal is **lights-out
shipping: 100s of PRs/day, fully autonomous, zero human-in-the-loop except a
genuine taste call.** Every rule here exists because the alternative was tried and
it collapsed — see [What broke on 2026-06-22](#what-broke-on-2026-06-22) for the
forensics that justify each one.

If you are an agent about to open a PR, read [Agent checklist](#agent-checklist).

## North star

- **Non-taste + CI-green → auto-merge.** No human. Correctness is a machine job.
- **Taste-touching → one click.** A screenshot in the PR body + a 👍/`/approve`
  comment from a maintainer clears it (the `taste-approve` workflow). Nothing else
  needs a human.
- **Throughput ceiling is CI cost and queue reliability, not merge wiring.** Keep
  the per-PR gate cheap; push everything heavy off the PR path.

## 1. Unit of work: one small PR → `main`

- **Default: a small, focused PR targeting `main`.** ≤ 400 lines / 10 files
  (`pr-size-guard`). Independent changes are **sibling PRs off `main`** — parallel,
  never based on each other.
- **Dependent work → a real `gt` stack** (`gt create` per step; restacks once;
  children auto-retarget to `main` as bases land). **Never** hand-create N
  base-on-base PRs — that ran 63 full CI pipelines for one diff and collapsed the
  queue (#11689). One mechanical sweep = **one `big-pr` PR**
  ([`pr-stacking.md`](../.claude/rules/pr-stacking.md)).
- **Always target `main`** (or a live integration branch), **never an ephemeral
  stack-base branch** — when that base is deleted the PR shows a phantom
  `CONFLICTING` (this bit #11589). If a PR's base is gone, retarget to `main`.
- **Integration branches are an option, not the default** — use only for a
  coordinated multi-agent wave on one domain, then one train PR
  ([`ci-branching.md`](../.claude/rules/ci-branching.md)).

## 2. CI is risk-tiered (the performance core)

A 1-line change must not pay for a full build + CodeQL + Lighthouse + E2E. Each PR
runs **only what it touches**; everything heavy runs post-merge or nightly.

| Tier | Jobs | Trigger |
|---|---|---|
| **PR gate** (must stay fast) | typecheck, lint, **affected** unit tests, structural contract, size guard, the required-check set | every PR — turbo `--affected` + remote cache |
| **Post-merge (`main`)** | CodeQL, Trivy, Gitleaks, TruffleHog, Scorecard, deploy | `push: main` |
| **Nightly** | SonarCloud, deep CodeQL, full E2E matrix, exhaustive suites | `schedule` |

Rules:
- **Heavy scans never gate a PR or a `gtmq_*` merge-queue batch.** Running CodeQL
  ×5 + the full security suite per-PR saturated the runner pool and made Graphite
  retry-storm itself into a 6-hour stall. CodeQL / Trivy / Scorecard scan the
  *merged* code on `main` + nightly.
- **Exception — secret scanning gates PRs.** A diff-scoped gitleaks + trufflehog
  runs on every PR (~10s, 1 slot): a leaked key on this **public** repo is scraped
  within seconds of hitting `main`, so it is EVENT-class and must be caught
  pre-merge. The full-history secret scan stays nightly.
- **The PR gate is the only merge gate.** Keep it under a few minutes. If a lane
  isn't required for correctness of *this* diff, path-gate it or move it off-PR.
- Remaining lever: turbo `--affected` + remote cache on the PR gate so cache-hit
  jobs finish in seconds (tracked in JOV-3461).

### Does my change need the heavy lane, a preview, or taste approval?

Most PRs auto-merge on the fast gate. These paths are the exceptions — know them
before you open the PR (source: `.github/ci-harness/manifest.json` `riskRules`):

| If your diff touches… | What happens |
|---|---|
| `auth-identity`, `billing-money`, `db-migrations`, `proxy-middleware`, `env-config`, `agent-control-plane`, CI workflows | **High risk** → smoke + preview evidence required, and **unattended auto-merge is blocked** (a human/orchestrator must clear it). Expect a `needs-human` hold — that's by design, not a bug. |
| Public UI / profile surfaces | **Medium** → preview deploy + Lighthouse/a11y run; does *not* block auto-merge. |
| Anything else (logic, tests, docs, internal app) | Fast gate only → auto-merges when green. |

- **Want a preview deploy** when it isn't auto-triggered? Add the `deploy-preview`
  (or `testing`) label — see [`release.md`](../.claude/rules/release.md).
- **Taste-touching change** (design / UX / copy)? Put a **screenshot in the PR body**
  and a maintainer's 👍/`/approve` clears `needs-human-taste`. Accepted screenshot
  forms (the `taste-approve` matcher): markdown `![alt](url)`, an `<img>` tag, a
  direct image URL (`.png/.jpg/.gif/.webp`), or a `github.com/user-attachments` /
  `user-images.githubusercontent.com` link. A non-matching link silently fails the
  gate — use one of these.

## 3. Merge: autonomous, per-PR, self-healing

- **Enrollment is automatic.** `merge-queue-autoenroll` labels every mergeable,
  non-failing, non-taste PR `merge-queue`; Graphite merges it when the gate is
  green. You don't merge by hand.
- **The queue tolerates transient state.** A PR is only dequeued on a real merge
  conflict, `needs-conflict-resolution`, or a **terminal** failing check
  (`FAILURE`/`ERROR`/`TIMED_OUT`/`ACTION_REQUIRED`). A `pending`/`queued`/`cancelled`
  check is **not** a failure — `cancel-in-progress` leaves zombie cancelled
  check-runs, and treating those as failures is what stripped enrollment every 20
  min and starved the queue (#11727). Do not regress this.
- **Don't bypass the queue as a habit.** The reversible admin bootstrap (ruleset →
  `evaluate` → merge → `active`) exists only to land a fix that repairs the queue
  itself, when the queue can't yet land it. It is not the normal path.

### Merge-queue stall watchdog

Enrollment (`drain-pr-queue.sh`) only guarantees a clean PR *gets* the
`merge-queue` label — it doesn't watch what happens after. Measured stall
data showed a p90 of 94 minutes and a max of 770 minutes between label and
merge, with no rescue for a PR that stays clean and green but Graphite stops
progressing on. `scripts/merge-queue-watchdog.sh` runs on its own `*/10`
cron tick and rescues those PRs:

- A PR must have carried `merge-queue` for at least `STALL_MINUTES` (default
  45) before the watchdog acts on it.
- Conflicting/dirty PRs get `needs-conflict-resolution` only — the watchdog
  never removes `merge-queue` itself for conflicts; the next `drain-pr-queue.sh`
  pass owns that dequeue, so the two scripts never race on the same label.
- A terminal red required check (same definition as drain: only
  `FAILURE`/`ERROR`/`TIMED_OUT`/`ACTION_REQUIRED`/`STARTUP_FAILURE`) dequeues.
- Otherwise — clean, green, and still stuck — the watchdog label-cycles
  `merge-queue` (remove, re-add) to force Graphite to re-observe the PR.
  Graphite is not the GitHub-native merge queue, so there is no
  `dequeuePullRequest` GraphQL mutation to call; a label cycle is the only
  lever available.
- **Anti-thrash:** at most one label-cycle kick per PR per `COOLDOWN_HOURS`
  (default 2), tracked via a hidden-marker PR comment. The enroll and
  watchdog jobs share one concurrency group so they never mutate labels
  concurrently.

## 4. The one human gate: taste

- Taste-touching changes (design / UX / copy) get `needs-human-taste` **and a
  screenshot in the PR body**.
- A maintainer clears it with an approving review or a `/approve` | `lgtm` | 👍
  comment — the `taste-approve` workflow verifies the screenshot, removes the
  label, and hands the PR to the queue. No checkout, one click.
- **Everything else is lights-out.** A `needs-human` / `needs-human-taste` on an
  automated, CI-gated, non-taste PR (a dep bump, a screenshot regen) is a **bug** —
  a false-positive labeler kills a PR's autonomy. Fix the labeler (e.g. #11712,
  where a `@radix-ui` bump was tagged auth because the guard grepped the lockfile).

## 5. Guardrails that enforce this

| Guardrail | Stops |
|---|---|
| `pr-size-guard` | Oversized PRs (codemods use `big-pr`) |
| stack-depth guard (JOV-3457) | Runaway base-on-base agent stacks |
| `drain-pr-queue.sh` (terminal-failure-only) | Zombie-check churn dequeuing green PRs |
| `taste-approve` | Taste merges without a screenshot / by non-maintainers |
| Risk-tiered triggers | Heavy scans saturating runners on the PR path |

## What broke on 2026-06-22

The queue stalled for 6 hours and looked like "Graphite is paused." It wasn't.
Three compounding bugs on a finite runner pool:

1. **Stacked-codemod pileup** — a token sweep shipped as 63 base-on-base PRs; the
   queue landed them bottom-up at full CI each → never drained. Collapsed in #11689.
2. **Drain churn** — `drain-pr-queue.sh` counted zombie `cancelled`/`queued` checks
   as failures and stripped `merge-queue` from green PRs every 20 min, so no PR
   stayed enrolled long enough to land. Fixed in #11727/#11730.
3. **CI-tiering runaway** — CodeQL ×5 + the security suite ran on every PR **and**
   every Graphite batch; batches couldn't get runner slots, timed out, and Graphite
   retried every few minutes — each retry spawning another full run that saturated
   the runners further. Fixed in #11735 by moving scans off the PR path.

Plus a false-positive labeler (#11712) parking safe PRs as `needs-human`. None of
it was a paused queue. **The lesson encoded above: cheap per-PR CI, a queue that
tolerates transient check states, no heavy scans on the PR path, and labelers that
never false-positive.**

## Agent checklist

Before you open a PR:

1. **Small + focused**, targeting `main`. Dependent? `gt` stack. Mechanical sweep?
   one `big-pr` PR. Never base-on-base micro-PRs.
2. **Don't add heavy CI to the PR path.** New scan/security/perf job → post-merge
   or nightly, not `pull_request`.
3. **Taste-touching?** Add a screenshot to the body and let the 👍 gate handle it.
   Otherwise expect it to auto-merge — don't add `needs-human`.
4. **Verify locally** (typecheck, lint, affected tests), push, open a draft PR,
   let the fast gate run. Don't hand-merge; the queue does it.
5. If a PR's base branch was deleted, **retarget to `main`** before debugging a
   "conflict."

Related: [`pr-stacking.md`](../.claude/rules/pr-stacking.md),
[`ci-branching.md`](../.claude/rules/ci-branching.md),
[`release.md`](../.claude/rules/release.md),
[`docs/company/autonomous-shipping-doctrine.md`](company/autonomous-shipping-doctrine.md).
