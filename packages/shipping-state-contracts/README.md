# @jovie/shipping-state-contracts

Shared task-tracking contracts for `ovie.shipping-state.v1` consumers: Jovie
(web), Ovie (shipping screen), and — via `tracking-task.schema.json` — the Mac
app's Swift store, which mirrors this model rather than inventing its own.

## The one-model rule

There is exactly ONE task model. Linear is canonical; every row's identity is
`linear:JOV-*`. This package owns the shared types (workflow states, lane
agents, priorities, sync states, `OperationalTask`) that were previously
defined in `apps/web/lib/ovie/shipping-state/contract.ts` — that file now
re-exports them from here, so Jovie producers and presentation adapters all
consume the same definitions. Do not fork these types into a second model.

## What lives here

- `operational-task.ts` — the canonical operational-task model (moved verbatim
  from `apps/web/lib/ovie/shipping-state/contract.ts`).
- `tracking.ts` — the presentation status layer:
  - `TrackingStatus`: `queued | running | in-review | blocked | done | failed | cancelled`
  - `TrackingExecutorKind`: `codex-cloud | hyperagent | local | github-actions | unknown`
  - `TrackingContainer` — where work executes; `null` means unknown, never `local`.
  - `TrackingTask` — the shared row shape.
  - Pure mappers: `workflowStateToTrackingStatus`, `mapLinearState`,
    `mapGitHubPullRequest`, `mapCodexCloudTask`, `toTrackingTask`,
    `sortTrackingTasks`, `groupTrackingTasksByStatus`.
- `tracking-task.schema.json` — JSON Schema (draft 2020-12) for `TrackingTask`
  and its enums, so Swift can mirror the model without importing TypeScript.

## Status precedence (highest first)

1. Explicit terminal Codex/Linear `cancelled` or `failed`.
2. The live lane workflow state (`OperationalTaskWorkflowState`).
3. The GitHub PR / check rollup.
4. The Linear issue state (or non-terminal Codex run status).

Unknown never becomes `done` or `queued`: unknown Linear/Codex strings map to
`null`, and `toTrackingTask` refuses to compose a row when no signal resolves.
Failed/cancelled live only on `TrackingStatus` — no members are added to
`OPERATIONAL_TASK_WORKFLOW_STATES` (the web UI switch is exhaustive over it),
and failing checks on an open PR never become `failed` on their own.

The Codex mark (`showCodexMark`) is true only for a real Codex Cloud container
(`container.kind === 'codex-cloud'`). A `codex/` branch prefix alone never
earns the mark — that may be a local Codex CLI lane.

## Out of scope

UI. The Ovie shipping screen and any Jovie presentation render `TrackingTask`
rows; their design lives elsewhere (Pen, per the shipping-display IA).
