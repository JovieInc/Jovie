# JOV-5257 — Pre-lease blocker

Observed: 2026-08-21T00:52:31Z

## Stage

`pre-lease-provenance`

## Typed reasons

- `symphony-run-id-missing`
- `symphony-lease-id-missing`
- `worker-id-missing`
- `agent-profile-missing`
- `lease-provenance-unverifiable`

## Evidence

- Execution host is exactly `gem`.
- Workspace is `/home/timwhite/symphony-workspaces/JOV-5257` and starts at fresh `origin/main` SHA `4381748e14d18cfcdc094664e0070ed6eb5301e2`.
- GBrain `agent-org-chart` read succeeded and assigns implementation to Symphony and verification to Gem.
- Targeted GBrain ownership search found no competing JOV-5257 implementation claim.
- The fresh `jovie-fleet-gate/v1` receipt observed at `2026-08-21T00:52:24.705023Z` is `AMBER` with reason `production-deployment-unbound`; `workAdmission.newIssueLeaseAllowed=true`.
- `.symphony-routing.json` binds JOV-5257 to `codex-sol`, but it does not provide a Symphony run ID, lease ID, or worker ID.
- The process environment contains no `JOVIE_AGENT_PROFILE`, Symphony run ID, Symphony lease ID, worker ID, or independently verifiable lease receipt.

## Required admission receipt

Before implementation may start, one Symphony lease must truthfully and verifiably bind all of:

```text
orchestrator=symphony
execution_host=gem
linear_issue=JOV-5257
symphony_run_id=<nonempty>
symphony_lease_id=<nonempty>
worker_id=<nonempty>
workspace=/home/timwhite/symphony-workspaces/JOV-5257
base_sha=4381748e14d18cfcdc094664e0070ed6eb5301e2
```

## Mutation status

No source edit, Linear mutation, child admission command, push, PR, refresh, lease, or worker/session creation was performed. Retry ceiling is zero; next action is authoritative Symphony lease reconciliation and a newly admitted run, not local replay.

## Recurrence checks

- `2026-08-21T00:56:04Z`: blocking condition repeated. No run ID, lease ID, worker ID, coding profile, or workspace provenance receipt appeared. The fleet receipt file remained unchanged at `2026-08-21T00:52:31.211959814Z`.
- `2026-08-21T00:56:21Z`: third consecutive audit found the same missing provenance. The fleet gate remained `AMBER`, `newIssueLeaseAllowed=true`, observed at `2026-08-21T00:52:24.705023Z`; permission to create a lease is not evidence that a lease was created.
