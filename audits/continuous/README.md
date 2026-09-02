# Jovie continuous audit program

This directory is the canonical audit registry and coverage contract. It
coordinates existing probes; it is not a new scheduler or control plane.

## Run locally

```bash
pnpm run audit:continuous:validate
pnpm run audit:continuous:plan -- --changed apps/web/proxy.ts --limit 5
pnpm run audit:continuous:pilot -- \
  --input audits/continuous/pilots/2026-09-02-ci-merge-throughput/pilot-input.json
pnpm run test:continuous-audit
```

`validate` fails closed on missing families, incomplete budgets or boundaries,
unmapped coverage, unsafe Hyperagent state, proof-tier collapse, or active
schedule claims. `plan` ranks only bounded partitions. Changed, overdue,
incident-linked, and high-risk areas receive more weight; a full-repo model scan
is never a fallback.

## Finding lifecycle

1. Run deterministic probes first.
2. If model judgment adds value, qualify the exact provider and model for this
   run, sanitize the selected partition, and enforce the family's cost cap.
3. Normalize the result into `continuous-audit-finding/v1`.
4. Validate at least one direct evidence item. A model output is never evidence
   for itself.
5. Deduplicate by family, partition, rule, primary location, and normalized
   claim digest.
6. For selected high-risk scopes, run another qualified provider family and
   retain agreement or disagreement explicitly.
7. End every accepted finding as `fixed`, `disproven`,
   `deferred-with-expiry`, or `blocked` with an owner and gate.
8. Turn repeated accepted failures into an executable invariant: a test, metric,
   or typed receipt. A document-only rule is not recurrence proof.

## Proof tiers

Every run records source, CI, queue, deploy, and runtime separately. A tier can
be `verified`, `observed`, `availability-only`, `not-collected`, or
`not-applicable`. Missing evidence never borrows truth from another tier.

Examples:

- A green source PR is not native queue proof.
- A successful direct-main authorization with skipped change lanes is not a
  full-suite receipt.
- A queued or successful controller is not immutable deployment proof.
- HTTP 200 is availability evidence, not exact-build runtime parity.

## Provider qualification

The deterministic provider is always eligible. Model providers are conditional
and require a receipt less than 24 hours old proving authentication, exact model
identity, read boundary, secret scan, customer-data exclusion, cost cap, fixture
eval score, structured output, and receipt location.

Hyperagent is explicitly `unqualified`. The validator rejects it even if a run
supplies a syntactically complete receipt. Qualification requires a reviewed
registry change after all required receipts exist. No provider may silently
substitute for another.

## Files

- `registry.json`: families, provider/model gates, budgets, evidence, risk,
  recurrence, and acceptance.
- `coverage-map.json`: weighted partitions and explicit exclusions.
- `ADOPT_FIRST.md`: adopt/extend/compose/build decision and evidence.
- `SCHEDULING_PROPOSAL.md`: safe cadence and activation gate; no job exists.
- `pilots/`: immutable bounded inputs, generated reports, and human review.
