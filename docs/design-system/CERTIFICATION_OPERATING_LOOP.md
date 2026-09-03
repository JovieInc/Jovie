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
