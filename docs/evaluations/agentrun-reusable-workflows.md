# AgentRun-style reusable workflows (JOV-8200)

Status: Phase 1 research complete. **Decision: REJECT** adoption of the AgentRun
runtime/DSL. The underlying pattern — deterministic code for mechanical steps,
bounded typed model judgments for narrow uncertainty, full agents only for
investigation — is already the incumbent Summer/Symphony architecture. No Phase 2
pilot is commissioned; nothing in this document is permission for a migration.

## Current-state map (source-backed)

Summer → Symphony/Jovie Lanes path today:

- **Source of truth:** Linear issues; admission and routing are deterministic in
  `scripts/backlog-orchestrator/` (`deterministic-gates.mjs`,
  `admission-gate.mjs`, `admission-policy.mjs`, `symphony-routing.mjs`,
  `lane-capacity.mjs`, `stale-lease-guard.mjs`). Team routes JOV/LYB are code, not
  model output (`deterministic-gates.mjs` `TEAM_ROUTES`).
- **Workers:** `scripts/lanes/` Python harness (claude/codex/devin lanes) with
  capacity limits, leases, and HOT ZONE claims. Hermes-Air is the always-on
  ingestion node; the retired Elixir control plane lives in
  `JovieInc/symphony-control` (see `docs/AGENT_OS_ARCHITECTURE.md`).
- **Bounded judgments:** `scripts/invariants/jev-gateway.mjs` provides Jev
  (`jev-shadow/v1`) typed evaluation behind fingerprinted, admission-bounded
  approvals with funding envelopes — exactly the "decision model for narrow
  uncertainty" role. It proposes; it never attests CI, merges, or closes issues.
- **Review/CI:** `docs/evaluations/pr-review-kernel.md` — deterministic risk
  floors, shadow receipt, merge authority stays with `github.ci` + merge queue.
- **Repeatable-work receipts:** `AgentRunArtifact` contract (source, kind,
  modelRoute, allowedActions/forbiddenActions, costEstimateUsd) is already the
  canonical run-record shape; `backlog-orchestrator/reconcile.mjs` already emits
  `backlog-orchestrator/reconcile/v1` dry-run/mutating receipts.
- **In-flight overlaps (do not duplicate):** JovieInc/Jovie#21301 dedicated
  Linear app token, #21304 Linear mirror/outbox claim ledger,
  LogYourBody#1330 queue recovery. Adjacent owners: JOV-2966 (capability
  sourcing), JOV-8120 (scaffolding benchmark), JOV-7341 (Jev/Decisions),
  JOV-7330 (warm-worker economics), JOV-5217 (workflow promotion).

## AgentRun findings (upstream, verified 2026-10-13)

- Repo `parcha-ai/agentrun`: Apache-2.0, ~232 stars, ~95 commits, version
  `0.1.0-beta.2` per its own docs. Early-stage, single-vendor DSL.
- Primitives: `chain`, `map`, `parallel`, `loop`, `judge`, `pick`, `sift`,
  `route`, `agent`/`decide`/`extract`, `code`, `call`, `workflow`, `escalate`,
  `report`/`artifact`. Typed input/output JSON schemas; escalation returns early
  with reason + state. These are real and documented, not marketing-only.
- Costs of adoption: a second runtime (`@parcha/agentrun-dsl`), a workflow JSON
  format parallel to our receipt schemas, a `TYPESAFE_API_KEY` credential path
  (we already hold `AI_GATEWAY_API_KEY` with Doppler), `call`/`code` nodes that
  execute JavaScript during validation (`--trusted` flag exists because of this),
  and a Pi-CLI-centric authoring path orthogonal to our lanes harness.
- Security/egress: any `judge`/`route`/`sift` adoption would send issue/PR text
  through the TypeSafe path — duplicating, not extending, the existing
  Jev/Gateway screen. Data-scope policy is already fixed in
  `pr-review-kernel.md` (Tim, 2026-09-25).
- No durable scheduler, ledger, or lease semantics in the DSL — the host owns
  tools, delivery, storage. Adopting it would add a runtime while leaving us to
  re-implement the parts our orchestrator already has.

## Candidate workflow mapping

1. **LYB backlog/PR reconciliation (preferred test, LYB-149):** already covered
   by `reconcile.mjs` + `classifier.mjs` + `triage-router.mjs` receipts. The gap
   is richer duplicate/collision grouping, which is an incremental feature in
   the existing module — not a new framework.
2. **Release-note evidence selection:** deterministic gates + Jev shadow already
   fit; no new seam needed.
3. **CI-failure classification:** `ci-fast-lanes.mjs` /
   `merge-queue-green-enroll` already do deterministic classification; Jev
   shadow is the bounded-uncertainty route.

None of the three requires a second cleanup worker or scheduler — consistent
with the ticket's constraint.

## Options compared

- **Reject/no change:** correct for the runtime. The claimed savings would come
  from the pattern, which we already implement.
- **Simplify existing code:** ongoing, owned by incumbent modules; not gated on
  this decision.
- **Adapt the pattern within existing seams:** already true — deterministic
  gates + `jev-shadow` + escalation-to-lane is the AgentRun shape. Documenting
  it as such is this ADR.
- **Version-pinned AgentRun adapter:** rejected. Adds a beta DSL, a new
  credential surface, JS-in-workflow execution risk, and a parallel run-record
  schema with zero capability gain over the incumbent seams.

## Economics

Adoption cost: new dependency tree, workflow-JSON format governance, security
review of `code`/`call` execution, credential plumbing for TYPESAFE, plus
re-derivation of permissions/leases the orchestrator already enforces. Expected
benefit: none demonstrated — our measured lever is the existing
audit-expensive/implement-cheap router and Jev shadow promotion criteria, not a
new DSL.

## Decision

**REJECT** AgentRun runtime adoption. Next action: none required; the small
reconciliation-grouping improvements belong to the incumbent
`scripts/backlog-orchestrator` owner under normal Symphony review/CI gates.

**Evidence that would reverse this:** (a) upstream AgentRun reaches a stable
1.x with demonstrated durable-run/lease semantics we lack, (b) a replayed
corpus shows our deterministic+Jev seams materially underperforming AgentRun
workflows on accurate dispositions per dollar, or (c) a workflow emerges with
no existing seam that the DSL satisfies better than ~200 lines of orchestrator
code. Any of these reopens evaluation via JOV-2966 capability sourcing, not
this ticket.

**Kill criteria for any future pilot:** new scheduler/queue/ledger introduced;
model proposes state transitions code does not enforce; any attestation of CI,
deploys, or issue closure by a probabilistic node; shadow mode skipped.

## Rollback

Nothing to roll back — no code, dependency, credential, or workflow changes
were made.
