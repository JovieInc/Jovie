# Event-driven learning delivery

Owner: Summer for post-mortem/quality evidence; existing producers retain their
terminal results, exceptions, outcomes, and source revisions. JOV-8427 retires
clock entry points; it adds no scheduler, log miner, model client, or governor.

## Current source behavior

- [Shipping SLO](../../.github/workflows/shipping-slo.yml) keeps its daily SLO
  monitoring, snapshots, regression intake, and ratchet. It no longer invokes
  post-mortem review or uploads weekly learning reports.
- [Quality Gap Finder](QUALITY_GAP_FINDER.md) consumes relevant `main` pushes
  and `quality-gap-scan` events. The signed Linear webhook preserves terminal
  post-mortem/defect and gained exception-label delivery to this model-free
  path. Explicit manual repair/dry runs remain available. The handlers reject
  GitHub `schedule` before filesystem collection, Linear writes, or GBrain work.
- [Growth stewardship](../../scripts/invariant-stewardship/audit.mjs) validates
  bounded evidence only: five sources, one proposal, existing authority checks.
  Validation is not permission to invoke a model, publish, spend, or promote.
- [Bounded lesson analysis](../../scripts/lib/lesson-analysis.mjs) consumes
  previously admitted evidence through certified routing and independent review.
  It owns neither event intake nor admission and is not a scheduled entry point.

## Revision-bound intake

New `jovie-growth-learning-intake/v2` receipts require `causalEvent` with a stable
producer `id`, `kind`, and immutable `sourceRevision`. Kinds are
`terminal-result`, `exception`, `evidence-threshold-crossed`, and `pending-job`.
This is the growth adapter's intake identity, not a replacement canonical event
ledger. The source owner supplies identity; delivery timestamps are not revisions.

The dedupe key is `growth-learning:v2:sha256:<event digest>:sha256:<source digest>`.
The event digest hashes the ordered tuple `[kind, id, sourceRevision]`; the source
digest retains `sha256:sorted-source-id-ref-revision/v1`. The validator recomputes
both. Redelivery across a week boundary retains identity. Changed causal or
source revisions produce a new identity but must still pass evidence/authority
checks. `priorDedupeKeys` accepts both v2 and historical weekly keys.

Weekly `jovie-growth-learning-intake/v1` snapshots retain their original bytes,
periods, and keys. They project as `historical`, `admissionEligible: false`, and
`historical-only` for each record. They are not re-evaluated into new admissions
as the clock changes. V2 rejects `period`, absent causal identity, schedule-shaped
causes, and scheduled delivery. No clock migrates a weekly receipt into v2.

## Reconsideration and acceptance

**Ship now:** retire weekly post-mortem and nightly Hermes learning, preserve
current deterministic evidence owners, and validate causal/revision identity.

**Re-evaluate when:** a terminal result or exception is delivered, source evidence
is corrected or revised, accumulated confidence/value crosses a threshold, event
delivery fails, or a relevant pending job needs that evidence. **Then:** the
existing owner considers only the affected evidence with dedupe, explicit missing
telemetry, current budgets, and unchanged authority/release protections. Normal
unchanged evidence does not warrant analysis or another issue. Neither elapsed
time nor an arbitrary run count independently admits learning.

The post-mortem recurring-class threshold remains two. Quality Gap Finder keeps
its 0.5 confidence floor, 0.75 high-confidence boundary, five high-confidence
issues/run and three low-confidence issues/day. These caps limit event work;
they do not cause a scheduled run.

Shared Tier 1 admission remains owned by
[JOV-8419](https://linear.app/jovie/issue/JOV-8419), management outcome delivery by
[JOV-8424](https://linear.app/jovie/issue/JOV-8424), and learner economics by
[JOV-8426](https://linear.app/jovie/issue/JOV-8426). Their source/runtime acceptance
is pending; retiring clocks does not certify those paths or authorize a fallback
sweep. Local workflow/handler tests prove source behavior only. Hosted CI,
deployment, and observed terminal/exception delivery require separate receipts.

## Superseded operations

The [Hermes rule](../../.claude/rules/hermes-air.md),
[operator history](../HERMES_AIR.md), and Fable pipeline notes are historical
references. Their nightly dispatch-log clustering, bootstrap/restart commands,
and old model/cost claims cannot reactivate a runtime or authorize a full-log
sweep. The current Mac runner, dogfood verifier, unrelated monitors, CI gates,
and release controls retain their existing contracts.
