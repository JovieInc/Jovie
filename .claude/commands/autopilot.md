---
description: Lead-orchestrator skill for Jovie Agent Teams mode. Use to continuously intake Linear work, dispatch teammates, run /ship, and keep PR + Linear status synchronized with retry/escalation.
---

# Autopilot Lead Orchestrator Skill (Jovie)

Use this skill when operating Claude Code in **Agent Teams mode** with background orchestration.

## Mission

Continuously intake Linear work, route tasks to teammates, ship safely through `/ship`, and keep PR + Linear state synchronized with minimal operator intervention.

## Required Environment (hard requirements)

- Repository: Jovie monorepo root
- Node.js: **22.x**
- pnpm: **9.15.4**

Before any task execution:

1. Verify `node --version` is 22.x
2. Verify `pnpm --version` is 9.15.4

Execution conventions:

- Run commands from repo root
- Use `pnpm --filter web ...` for web-only tasks
- Use `pnpm turbo ...` for monorepo tasks
- Never use npm/yarn

## Non-Negotiable Guardrails

1. Never edit/delete/rename files in `drizzle/migrations/`
2. Never create `middleware.ts` (use `apps/web/proxy.ts`)
3. Never add `// biome-ignore`
4. Use conventional commits
5. For bug fixes, search and fix sibling occurrences
6. Keep marketing/legal routes fully static
7. Render global providers once in root layout only

## Linear Issue Gating (mandatory)

Before dispatching or executing any Linear issue:

- Skip issues labeled `human-review-required`
- Skip issues whose description contains `This issue requires human review`
- Do not work on, close, or comment on skipped issues

When querying Linear, always apply both filters:

- Exclude label: `human-review-required`
- Exclude description containing: `This issue requires human review`

## Orchestration Loop (run continuously)

### 1) Intake from Linear

- Poll team `jovie` for issues in `new` or `ready`
- For each issue not already queued:
  - Create a shared Agent Teams task
  - Subject: issue title
  - Description: issue body + Linear URL + acceptance criteria
  - Include dedupe key = Linear issue ID

### 2) Batch Analysis

After intake, group small related issues into batches before dispatch. This avoids PR sprawl when multiple trivial issues target the same area.

**Batching eligibility** — ALL must be true for each issue in a candidate batch:

- **Trivial scope**: UI tweak, copy/text change, style fix, config change, or similar — no new features, no logic changes, no schema changes
- **Same target area**: Issues touch the same component, page, or module (e.g., all target `apps/web/components/dashboard/` or `apps/web/app/(app)/settings/`)
- **Same change type**: All UI fixes, all copy updates, all style tweaks, etc. — don't mix types
- **Within PR size limits**: Combined estimated diff ≤ 400 lines and ≤ 10 files (per AGENTS.md)
- **Max 5 issues per batch**: Keeps PRs reviewable

**Grouping algorithm:**

1. From the intake queue, identify issues that look trivial (based on title, description, labels, and estimated scope)
2. Group by `(target area, change type)` — e.g., `(dashboard components, UI fix)` or `(settings page, copy change)`
3. For each group, greedily pack issues into batches of up to 5, ensuring combined scope stays within PR limits
4. Issues that don't fit any batch remain as solo tasks (dispatched individually per existing behavior)

**Batch rules:**

- One batch = one branch = one PR
- Branch name: `fix/batch-<area>-<issue-ids>` (e.g., `fix/batch-dashboard-JOV-101-102-103`)
- If a batch fails validation, retry the **entire batch** — do not split mid-flight
- If a batch repeatedly fails (≥2 retries), break it into solo issues and redispatch individually

### 3) Dispatch + Task Execution

#### Solo issues (default path)

- Assign unclaimed tasks (or allow self-claim)
- Each task handler must:
  1. Implement minimal root-cause fix
  2. Run required validation gates
  3. Run `/ship` to commit, push branch, and open PR
  4. Link PR back to the Linear issue

#### Batched issues

- Single task handler implements **all issues in the batch** on one branch
- Work through issues sequentially, committing after each (or as logical units)
- Commit messages reference the specific issue: `fix(dashboard): update button spacing (JOV-101)`
- Final PR encompasses all commits for the batch
- PR title uses batch format: `fix(<area>): batch <type> fixes (<issue-ids>)`
- All Linear issues in the batch get linked to the same PR

### 4) Validation Gates (minimum)

- `pnpm turbo typecheck`
- `pnpm turbo lint`
- Targeted tests first, then broader coverage as needed
- Prefer `pnpm turbo test --affected` for efficiency

If task touches app/web runtime/db flows, run relevant scoped checks too.

### 5) Background PR Orchestration (parallel)

Continuously monitor teammate PRs and run `/orchestrate` behavior:

- Rebase/update branch
- Resolve merge conflicts when safe
- Address failing tests/CI
- Push follow-up fixes
- Sync PR status and summary back to Linear

### 6) Linear Status Sync Rules

#### Solo issues

- Merged/completed -> set `done` with PR link + merge SHA
- Open PR / awaiting review -> set `review` with PR link
- Blocked -> set `blocked` with explicit blocker + next action
- Retrying after failure -> comment attempt number + failure summary

#### Batched issues

- All issues in a merged batch -> set `done` on **every** issue with shared PR link + merge SHA
- All issues in an open batch PR -> set `review` on **every** issue with shared PR link
- If batch is blocked -> set `blocked` on all issues with blocker details
- If batch is broken into solo issues after repeated failure -> update each issue independently from that point

### 7) Retry + Escalation

- On failure, requeue with:
  - reason
  - logs summary
  - retry count
  - elevated priority when repeated
- Escalate to lead channel when retry threshold is exceeded

### 8) Efficiency Defaults

- Batch short tool calls
- Parallelize independent workstreams
- Avoid unnecessary full-suite reruns
- Use affected/scoped checks first, full checks only when risk warrants

## PR Output Requirements

### Solo PRs

- Linear issue link
- Concise change summary
- Validation evidence (typecheck/lint/test)
- Rollback notes for risky changes

### Batch PRs

Title format: `fix(<area>): batch <type> fixes (<issue-ids>)`

Example: `fix(dashboard): batch UI fixes (JOV-101, JOV-102, JOV-103)`

Body template:

```markdown
## Summary

Batch of <N> related <type> fixes in `<target area>`.

## Changes

### JOV-101: <issue title>
<1-2 sentence summary of what changed>

### JOV-102: <issue title>
<1-2 sentence summary of what changed>

### JOV-103: <issue title>
<1-2 sentence summary of what changed>

## Validation
- [x] typecheck
- [x] lint
- [x] tests

## Linear Issues
- JOV-101
- JOV-102
- JOV-103
```

### General

When required by team process, add PR comment:

`@claude review this PR`

## Stop/Control Commands

Run until operator sends one of:

- `pause orchestration`
- `resume orchestration`
- `drain and stop`

## Model Strategy

Prefer the model profile that maximizes:

1. Code execution reliability
2. Long-context repo reasoning
3. Token efficiency for repetitive orchestration
