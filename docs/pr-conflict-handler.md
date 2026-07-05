# PR conflict and freshness handler

`scripts/pr-conflict-handler.mjs` is the read-only-by-default control loop for keeping open PRs fresh without causing CI cancellation cascades.

## Design goals

The handler is intentionally conservative. It does **not** rebase the whole fleet. It classifies every open PR, orders the safe work, and only mutates a bounded number of CI-heavy PRs per run.

| Classification | Signal | Action |
| --- | --- | --- |
| `DIRTY` | `mergeable=CONFLICTING` or `mergeStateStatus=DIRTY` | Internal branch: attempt guarded rebase with safe autoresolution only; fork/non-trivial conflict: label `needs-manual-rebase`. |
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
4. Cap CI-heavy re-triggers with `--max-concurrent` (default `2`). The cap subtracts PRs whose CI is already in flight, so a run with two in-flight PRs schedules zero new update/rebase pushes.

This is Neon-pool aware: the default stays below the 4-slot ephemeral branch pool, leaving room for normal developer CI and avoiding pool starvation.

## Conflict handling policy

The only automatic conflict resolution currently considered safe is lockfile-only conflict regeneration:

- rebase in a temporary clone,
- if the only conflicted path is `pnpm-lock.yaml`, take the rebased side and run `corepack pnpm install --lockfile-only --ignore-scripts`,
- push with `git push --force-with-lease` only after the rebase succeeds.

Any other conflict path is labeled `needs-manual-rebase` and skipped. Fork/cross-repository PRs are never mutated with the internal branch flow.

## Usage

Dry-run is the default and performs only read-only GitHub API calls:

```bash
node scripts/pr-conflict-handler.mjs --dry-run --max-concurrent 2
```

Emit the structured JSON plan too:

```bash
node scripts/pr-conflict-handler.mjs --dry-run --json
```

Apply safe mutations (labels, GitHub update-branch, guarded rebase flow):

```bash
node scripts/pr-conflict-handler.mjs --apply --max-concurrent 2
```

Every decision is logged as structured JSON with PR number, state, action, reason, base/head refs, whether the branch is internal, and whether the action triggers CI.

## Tests

Pure classification, check summarization, ordering, capacity, fork-safety, and conflict-autoresolution policy are tested without hitting the GitHub API:

```bash
pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/pr-conflict-handler.test.mjs
```
