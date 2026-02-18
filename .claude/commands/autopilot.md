---
description: Lead-orchestrator skill for Jovie Agent Teams mode. Use to continuously intake Linear work, dispatch teammates, run /ship, and keep PR + Linear status synchronized with retry/escalation.
---

# Autopilot Lead Orchestrator Skill (Jovie)

Use this skill when operating Claude Code in **Agent Teams mode** with background orchestration.

## Mission

Continuously intake Linear work, route tasks to teammates, ship safely through `/ship`, and keep PR + Linear state synchronized with minimal operator intervention.

## Required Environment (hard requirements)

- Repository: Jovie monorepo root
- Node.js: **24.x**
- pnpm: **9.15.4**

Before any task execution:

1. Verify `node --version` is 24.x
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

## Orchestration Loop (run continuously)

### 1) Intake from Linear

- Poll team `jovie` for issues in `new` or `ready`
- For each issue not already queued:
  - Create a shared Agent Teams task
  - Subject: issue title
  - Description: issue body + Linear URL + acceptance criteria
  - Include dedupe key = Linear issue ID

### 2) Dispatch + Task Execution

- Assign unclaimed tasks (or allow self-claim)
- Each task handler must:
  1. Implement minimal root-cause fix
  2. Run required validation gates
  3. Run `/ship` to commit, push branch, and open PR
  4. Link PR back to the Linear issue

### 3) Validation Gates (minimum)

- `pnpm turbo typecheck`
- `pnpm turbo lint`
- Targeted tests first, then broader coverage as needed
- Prefer `pnpm turbo test --affected` for efficiency

If task touches app/web runtime/db flows, run relevant scoped checks too.

### 4) Background PR Orchestration (parallel)

Continuously monitor teammate PRs and run `/orchestrate` behavior:

- Rebase/update branch
- Resolve merge conflicts when safe
- Address failing tests/CI
- Push follow-up fixes
- Sync PR status and summary back to Linear

### 5) Linear Status Sync Rules

- Merged/completed -> set `done` with PR link + merge SHA
- Open PR / awaiting review -> set `review` with PR link
- Blocked -> set `blocked` with explicit blocker + next action
- Retrying after failure -> comment attempt number + failure summary

### 6) Retry + Escalation

- On failure, requeue with:
  - reason
  - logs summary
  - retry count
  - elevated priority when repeated
- Escalate to lead channel when retry threshold is exceeded

### 7) Efficiency Defaults

- Batch short tool calls
- Parallelize independent workstreams
- Avoid unnecessary full-suite reruns
- Use affected/scoped checks first, full checks only when risk warrants

## PR Output Requirements

Every shipped PR should include:

- Linear issue link
- concise change summary
- validation evidence (typecheck/lint/test)
- rollback notes for risky changes

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