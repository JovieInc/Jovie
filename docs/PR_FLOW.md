# PR Flow — How Agents Ship (Canonical)

The single source of truth for how code reaches `main`. The goal is **lights-out
shipping: 100s of PRs/day, fully autonomous, zero human-in-the-loop except a
genuine taste call.** Every rule here exists because the alternative was tried and
it collapsed — see [What broke on 2026-06-22](#what-broke-on-2026-06-22) for the
forensics that justify each one.

If you are an agent about to open a PR, read [Agent checklist](#agent-checklist).

## North star

- **CI-green → auto-merge.** No human. Correctness is a machine job.
- **Taste → LLM review + ship.** Taste-touching PRs get strong LLM review and
  ship autonomously; the taste classifier comment is a signal for post-ship
  walkthroughs. Nothing needs a human pre-merge.
- **Throughput ceiling is CI cost and queue reliability, not merge wiring.** Keep
  the source-PR gate cheap; put deterministic integration on the exact combined
  queue head and network/deploy/exhaustive depth after merge or on schedules.

## 1. Unit of work: one small PR → `main`

- **Default: a small, focused PR targeting `main`.** ≤ 800 lines / 40 files
  (`pr-size-guard`, repo vars `PR_MAX_LINES`/`PR_MAX_FILES`; mechanical codemods
  use `big-pr`). Independent changes are **sibling PRs off `main`** — parallel,
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

A 1-line source PR must not pay for a full build + CodeQL + Lighthouse + E2E.
Source checks stay fast and deterministic; exact combined-head integration runs
in the merge queue, while network/deploy/exhaustive depth runs later.

| Tier | Jobs | Trigger |
|---|---|---|
| **PR gate** (must stay fast) | typecheck, lint, portable iOS contract, structural contract, diff secret scan, size/fork/migration policy | every PR — deterministic, path-aware |
| **Merge queue** | combined-head `ci-fast`, five affected unit shards, one hosted build + layout workspace, path-selected hosted Xcode build/test, path-selected model-free Promptfoo/golden evals, diff secret scan, migration policy | GitHub `merge_group` synthetic head |
| **Release (`main`)** | exact queue proof or fail-closed direct-main fallback, then successful exact CI-attempt authorization into one `production-mutation` FIFO spanning staging, promotion, one centralized rollback owner, and final verification | completed successful `CI` workflow run for `main`; one bounded controller retry |
| **Post-deploy** | hosted public, homepage, and live Lighthouse probes against the immutable deployment URL while the controller retains its lease; authenticated smoke is explicit optional evidence until credentials exist; final current-main/canonical check; `Production Verified` marker | successful current production release |
| **Deep / nightly** | CodeQL, Trivy, full-history secret scans, Scorecard, SonarCloud, full E2E matrix, exhaustive suites | schedule, event, or explicit manual dispatch |

Rules:
- **Heavy scans never gate a source PR or a merge-queue batch.** Running CodeQL
  ×5 + the full security suite per-PR saturated the runner pool and made Graphite
  retry-storm itself into a 6-hour stall. CodeQL / Trivy / Scorecard scan the
  *merged* code on `main` + nightly.
- **Exception — secret scanning gates PRs.** A diff-scoped gitleaks + trufflehog
  runs on every PR (~10s, 1 slot): a leaked key on this **public** repo is scraped
  within seconds of hitting `main`, so it is EVENT-class and must be caught
  pre-merge. The full-history secret scan stays nightly.
- **The source PR gate stays deterministic and cheap.** The merge queue is the
  integration gate for the exact combined head. It owns affected unit shards,
  build, and deterministic layout evidence. Preview, Neon, E2E, Lighthouse,
  a11y, Storybook, golden-path, preview, and extended-smoke work never starts
  from a source-PR event or risk label. Run it through a hosted manual,
  scheduled, or repository event after the fast source gate. No PR label fans
  out CI.
- Remaining lever: turbo `--affected` + remote cache on the PR gate so cache-hit
  jobs finish in seconds (tracked in JOV-3461).
- **GitHub's native merge queue owns combined-head integration.** The
  `merge_group` event validates the synthetic SHA and emits the same required
  contexts as the source PR. Main reuses an exact successful merge-group SHA;
  direct/admin main commits fail closed on the current run's fallback contract
  before production promotion.

### Does my change need the heavy lane, a preview, or taste approval?

Most PRs auto-merge on the fast gate. These paths are the exceptions — know them
before you open the PR (source: `.github/ci-harness/manifest.json` `riskRules`):

| If your diff touches… | What happens |
|---|---|---|
| `auth-identity`, `billing-money`, `db-migrations`, `proxy-middleware`, `env-config`, `agent-control-plane`, CI workflows | **High risk signal** → routes deeper post-merge/nightly validation and names local reproduction commands; source `PR Ready` remains deterministic. |
| Public UI / profile surfaces | **Medium risk signal** → use the hosted manual preview/deep dispatch when review evidence is needed; Lighthouse/a11y never auto-start from the source event. |
| Design / UX / copy | **Taste-flagged** → `llm-review` label; strong LLM review + ship; classifier comment signals post-ship walkthrough. |
| Anything else (logic, tests, docs, internal app) | Fast gate only → auto-merges when green. |

- **Want a preview deploy?** Dispatch `CI` on the exact ref with
  `run_preview_deploy=true`; external Vercel preview status remains
  informational — see [`release.md`](../.claude/rules/release.md).

## 3. Merge: autonomous, per-PR, self-healing

- **Enrollment is automatic.** `merge-queue-autoenroll` revalidates every
  mergeable, non-failing, non-taste PR at its exact head, enrolls it in GitHub's
  native queue, then keeps `merge-queue` only as intent/audit evidence. You
  don't merge by hand.
- **The queue tolerates transient state.** A PR is only dequeued on a real merge
  conflict, `needs-conflict-resolution`, or a **terminal** failing check
  (`FAILURE`/`ERROR`/`TIMED_OUT`/`ACTION_REQUIRED`). A `pending`/`queued`/`cancelled`
  check is **not** a failure — `cancel-in-progress` leaves zombie cancelled
  check-runs, and treating those as failures is what stripped enrollment every 20
  min and starved the queue (#11727). Do not regress this.
- **Don't bypass the queue as a habit.** The reversible admin bootstrap (ruleset →
  `evaluate` → merge → `active`) exists only to land a fix that repairs the queue
  itself, when the queue can't yet land it. It is not the normal path.

### Native queue reconciliation

`drain-pr-queue.sh` reads authoritative GitHub queue state, not the audit
label. Every enrollment uses the exact current head SHA and proves the PR is
queued after mutation. Hard-gated, conflicting, or terminal-red entries are
dequeued through the native API and then have their audit label removed.
Pending, queued, and cancelled check runs are not terminal failures, preventing
dequeue/re-enroll loops during ordinary CI cancellation or main movement.

## 4. Taste: advisory, not a gate

- Taste-touching changes (design / UX / copy) get classified as `taste-required`
  by the taste classifier, which applies the `llm-review` label and posts a
  comment. The PR **ships autonomously** — taste does not block merge.
- The classifier comment is a signal for post-ship prod walkthroughs. Strong LLM
  review validates correctness pre-merge.
- `taste-approved` is no longer a human gate label — it was the old `taste-approve`
  workflow's terminal marker, which is now removed (2026-07-06). The classifier
  treats it as auto-ship if found on a reopened PR.
- A `needs-human` label on a CI-gated, non-taste PR (a dep bump, a screenshot
  regen) is still a **bug** — a false-positive labeler kills a PR's autonomy.

## 5. Guardrails that enforce this

| Guardrail | Stops |
|---|---|---|
| `pr-size-guard` | Oversized PRs (codemods use `big-pr`) |
| stack-depth guard (JOV-3457) | Runaway base-on-base agent stacks |
| `drain-pr-queue.sh` (terminal-failure-only) | Zombie-check churn dequeuing green PRs |
| `taste-classifier.mjs` | Taste-flagged PRs are routed to LLM review, not held |
| Risk-tiered triggers | Heavy scans saturating runners on the PR path |

### Runner label policy

Self-hosted runners must use explicit self-hosted labels only (`jovie-runner`,
architecture labels, machine labels). Never add GitHub-hosted labels such as
`ubuntu-latest`, `macos-latest`, or `windows-latest` to self-hosted runners: that
routes ordinary hosted-runner jobs onto local machines with different toolchains.
The merge-group unit route runs on hosted capacity and selects `jovie-runner`
only from fresh successful Runner Heartbeat evidence. Stale, malformed,
timed-out, or API-uncertain evidence succeeds with `ubuntu-latest`; the hosted
`runner-health-monitor` is observer-only and never mutates routing variables.

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
3. **Taste-touching?** Add a screenshot to the body. The classifier applies
   `llm-review` and the PR ships autonomously — there is no taste gate to wait
   on (the old 👍 `taste-approve` workflow was removed 2026-07-06). Don't add
   `needs-human`.
4. **Verify locally** (typecheck, lint, affected tests), push, open a draft PR,
   let the fast gate run. Don't hand-merge; the queue does it.
5. If a PR's base branch was deleted, **retarget to `main`** before debugging a
   "conflict."

Related: [`pr-stacking.md`](../.claude/rules/pr-stacking.md),
[`ci-branching.md`](../.claude/rules/ci-branching.md),
[`release.md`](../.claude/rules/release.md),
[`docs/company/autonomous-shipping-doctrine.md`](company/autonomous-shipping-doctrine.md).
