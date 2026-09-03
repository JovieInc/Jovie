# PR conflict and freshness handler

`scripts/pr-conflict-handler.mjs` and `.github/workflows/pr-conflict-handler.yml` implement the JOV-INV-021 closed loop for keeping open PRs fresh without passive human conflict holds or CI cancellation cascades.

## Design goals

The handler classifies every open PR, orders safe work, and mutates only an adaptively bounded cohort per run. The workflow's overrideable hosted-pool ceiling defaults to the current public-repository limit of 120, while the remediation cohort itself always starts at two and invalid capacity values fail low to two. Clean durable cohorts can ramp from 2 to 10 to 40; remediation failures, stale-head skips, high CI latency, or runner/queue saturation immediately back off.

| Classification | Signal | Action |
| --- | --- | --- |
| `DIRTY` | `mergeable=CONFLICTING` or `mergeStateStatus=DIRTY` | Same-repository branch: run bounded stronger-model FX on `ubuntu-latest`, verify the resolution, reread exact head and base, then plain non-force push. Forks emit a typed permission exception. Exhaustion is terminal for that exact head/base pair; a changed pair starts a fresh bounded lease. Neither path adds a human-hold label. |
| `BEHIND` | `mergeStateStatus=BEHIND` and mergeable | Use GitHub `update-branch`; cheaper and less risky than force-rebase. |
| `BLOCKED` | required aggregate check failing/missing or `mergeStateStatus=BLOCKED` | Do **not** rebase. Label/flag for CI repair because rebasing just wastes CI. |
| `UNSTABLE` | `mergeStateStatus=UNSTABLE` or any check is running/queued | Wait. Pushing would cancel the in-flight run via concurrency groups. |
| `MERGEABLE` | mergeable and not stale | No-op. |

Required checks default to Jovie's merge gate aggregates: `CI / PR Ready`, `CI / Migration Guard`, and `Fork PR Gate`. Duplicate cancelled check-runs are tolerated when a successful aggregate context exists, matching the repo's merge-queue lessons.

## Ordering and cascade avoidance

Planning is deterministic and dependency-aware:

1. Build a base-branch graph from open PR `baseRefName`/`headRefName`.
2. Process roots before children so stacked or integration-base PRs settle before dependent branches.
3. Within each level, process smallest diff first, then oldest PR, then PR number.
4. Treat `--max-concurrent` (default `40`) only as an operator ceiling. The effective FX cap is computed from observed hosted-runner capacity, active and queued Actions runs, conflict backlog, current remediation success, durable cohort receipts, CI latency, and stale-head skips.

Clean-behind updates and true-conflict FX share one adaptive trigger budget, so server-side update-branch calls cannot stampede CI ahead of the model-backed repairs.

## Conflict handling policy

Clean `BEHIND` branches use GitHub's exact-head Update Branch rebase. A true conflict starts an ephemeral merge of the exact current base into the exact PR head so the resulting commit is a fast-forward child of the PR head. FX may edit only the original unmerged file set. The job rejects FX-created commits, unresolved paths, unexpected files, stale source/base reads, and an unverified model response. It runs affected tests, rereads the live PR head and base immediately before delivery, and uses the Jovie App token for one plain push without force.

Every attempt writes a trusted status receipt on the exact head. A cohort becomes clean only after the exact repaired heads pass `PR Ready`, `Migration Guard`, and `Fork PR Gate`; its durable issue receipt records those runs' p95 latency and drives ramp/backoff after PRs merge. Human taste and steering happen before a shipping PR opens or in a separate follow-up PR; they never add a hold to the current shipping PR.

Bounded exhaustion emits a machine-readable terminal status and a typed steering receipt for the exact source/base pair. It does not claim a nonexistent background owner: the same unchanged pair is terminal, while a new source or base SHA is a new pair and receives a fresh bounded lease automatically.

## Usage

Dry-run is the default and performs only read-only GitHub API calls:

```bash
node scripts/pr-conflict-handler.mjs --dry-run --max-concurrent 40
```

Emit the structured JSON plan too:

```bash
node scripts/pr-conflict-handler.mjs --dry-run --json
```

Apply safe mechanical updates and emit a machine-readable FX matrix for the hosted workflow:

```bash
node scripts/pr-conflict-handler.mjs --apply --max-concurrent 40 --plan-file /tmp/conflict-plan.json
```

Every decision is logged as structured JSON with PR number, state, action, reason, base/head refs, whether the branch is internal, and whether the action triggers CI.

## Tests

Classification, trusted receipt parsing, exact-head policy, adaptive ramp/backoff, fork safety, bounded FX routing, taste/steering separation, and the hosted workflow contract are tested without mutating GitHub:

```bash
pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/pr-conflict-handler.test.mjs
```
