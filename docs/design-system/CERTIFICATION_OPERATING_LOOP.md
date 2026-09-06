# Certification Operating Loop

`jovie.certification/v1` is the single generic admission kernel for Jovie. It
composes existing AgentOS evidence producers and Taste Inbox presentation
without adding another review registry, route, database, queue, workflow
service, vendor, or certification authority. Ovie and Taste Inbox consume its
projection; persistence may store packets, decisions, and audit records but must
not fork digest or state admission.

## Contract

States are `working`, `review_ready`, `founder_locked`, `shipped`, and
`monitored`. Only `review_ready` emits a Taste Inbox card. `founder_locked` is
taste proof only: one founder approval bound to the current decision-evidence
digest. `shipped` also needs same-source CI, queue/merge, and deploy receipts;
`monitored` also needs same-source runtime/dogfood proof.

Taste digest inputs are `canonical_source`, `invariant_evaluation`,
`tests_coverage`, `visual_proof`, `canonical_references`, and
`required_variants`. Operational tiers are `ci`, `queue_merge`, `deploy`, and
`runtime_dogfood`. Operational progress is exact-head evidence, but it is
excluded from the decision digest, so same-source CI/queue/deploy/runtime
progress does not stale a valid founder taste decision.

## Founder Decisions

A founder decision binds to one deterministic decision-evidence digest. The
kernel rejects duplicate or replayed decisions for that digest. `approved`
locks taste only; feedback/rejection returns to `working` with audit history.
Storybook, Playwright, Pen, CI, native queue, deploy, and dogfood/runtime checks
remain evidence producers; projections delegate admission to the kernel.

## Marketing persistence and Review Ready projection

Adopt-first decision: **compose** the existing Ovie durable operating store with
the existing certification kernel and Review Ready boundary.

- `ovie_operating_kv` already provides production JSONB persistence across
  Vercel instances and Redis quota events. The server-only marketing adapter
  targets one namespaced compare-and-set ledger there, so no migration or
  second database is needed. This source change does not wire an active caller
  or prove a production database round trip.
- Design Lab proposal files remain proposal-specific local artifacts. Their
  pending/approved/rejected schema and filesystem lifecycle do not fit
  certification packets, operational receipts, or production persistence.
- `MARKETING_COMPONENT_REGISTRY` is the only denominator. The adapter creates
  one fail-closed placeholder packet per registry identity and blocks on
  denominator drift rather than silently adding, dropping, or certifying rows.
- Packet admission, decision replay protection, state, audit events, and taste
  digest always come from `certification.ts`. Persistence does not copy or fork
  those rules.
- The Review Ready projection selects only `review_ready` Taste Inbox cards,
  emits at most one, and emits none while an existing entry such as Badge owns
  the slot. Missing, pending, failed, blocked, rejected, shipped, and monitored
  records remain in the ledger but never become incomplete board rows.
- Packet writes carry a separate, numerically compared monotonic evaluation
  timestamp. Founder decisions cannot regress that watermark, and a stale write
  or CAS retry that loses to a newer packet fails closed instead of resurrecting
  older evidence. Every complete next ledger is runtime-validated before CAS;
  persisted decisions and audit events must remain bound to their identity.
- Max-one selection is a projection contract, not a durable board reservation.
  The eventual protected board consumer must use its existing transactional
  unique-write boundary and pass the current occupant back to the projection.
- The façade assumes a trusted server producer. Its caller must authenticate
  and authorize packet ingestion and founder decisions; caller-supplied reviewer
  text is an audit field, not proof of founder identity.

## Adapter reference

| Module | Surface | Responsibility |
| --- | --- | --- |
| `certification-adapter.ts` | `MarketingCertificationStore` | `ingestPacket`, `recordFounderDecision`, `projectLedger`, and `projectReviewReady` own persistence composition and projections. |
| `certification-adapter.ts` | ledger/projection types, schema/store constants, persistence/drift errors | Defines the versioned internal storage and fail-closed caller contract. |
| `certification-runtime-store.ts` | `getMarketingCertificationStore` | Lazily composes the canonical registry with `postgresRecordBackend`. |
| `certification-runtime-store.ts` | `ingestMarketingCertificationPacket`, `projectMarketingReviewReady`, `recordMarketingFounderDecision` | Server-only façade awaiting an authorized production consumer. |

Re-evaluate the storage choice if measured CAS contention or audit retention
makes the single ledger exceed the operating latency or row-size budget. Then
preserve the same typed ledger and kernel boundary while considering identity
shards or a dedicated table; do not create another review controller.
