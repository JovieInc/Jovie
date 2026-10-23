# Ownership and Agent Identity Canon

Status: Canon
Inherits: [`FLEET.md`](./FLEET.md)
Last updated: 2026-10-20
Source: Tim White, 2026-10-20 ("everything registered, owned, measured, auditable; nothing waits on Tim forever")

Two registries make ownership and identity checkable instead of remembered:

| Registry | What it holds |
|---|---|
| [`ownership.json`](./ownership.json) | Every repo, deployed service, workflow, CI lane, runner pool, Linear team and area, canon doc, data store and control loop, each with one agent owner, a repair route and an escalation chain. Retired services stay listed with when and why. |
| [`agent-identities.json`](./agent-identities.json) | Every agent, bot, session class and evaluator: principals, credential **names** (never values), allowed actions, boundaries, audit trail, agent owner, mesh binding, and whether the identity is dedicated, shared or borrowed. |

## Rules

1. **An owner is an agent role.** Tim is the single owner of last resort. He appears only as the last step of an escalation chain, never as a routine owner. A workflow header that says `accountable-writer: Tim` does not make Tim its owner; the registry names the agent role that repairs it.
2. **Unowned work fails CI.** `node scripts/ownership-registry.mjs` runs in `pnpm ci:control:test` (Source Validation and the merge-group structural lane). It fails when a workflow file, CI harness job, Mac lane, app, worker or canon doc has no entry; when an active entry's source is gone (mark it retired instead); when an owner is a human or unknown role; or when a chain does not end at the human of last resort.
3. **Identities are audited, not trusted.** Each identity lists credential names and where its actions are logged. A shared or borrowed identity (for example an agent acting as `itstimwhite` or with Tim's Linear key) must carry a tracked least-privilege fix (`JOV-…`) or `by-design`. Credential changes stay with Tim; agents propose them as Linear issues.
4. **The mesh is part of identity.** Every sender kind in `packages/jovie-cli/src/mesh.ts` must map to an identity. The registry documents `SUMMER_MESH_INBOX_ENABLED` and the mesh registries; it never changes mesh tokens or flags.
5. **Keep it live.** `node scripts/ownership-registry.mjs --live [--automation-file <automation registry>]` compares the identity registry with the live mesh agent list (read-only `jovie mesh read`) and the automation registry, and exits non-zero on drift: an agent running but unregistered, registered but dead (never seen or silent for 7 days), registry-stale, or running as a retired identity. Scheduling it is tracked in JOV-8686.

## Mac lane (JOV-8657)

`Mac Build + Test (combined)`, the `jovie-mac` child lanes and their workflows are owned by **gem-ci-repair**. A Mac-only failure caused by the diff (for example GNU-only `date -d`) is labelled to the PR's writer lane by Lane Fix Relay; a lane defect is repaired by gem-ci-repair and filed as `remediation:mac-lane`; an offline Mac pool falls back to hosted macOS and is repaired by gem-hostops. The portability guard is JOV-8685.

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-10-20 | Created both registries and the CI check; assigned the Mac lane a repair owner. | Tim White |
