# Learning attachments to canonical evidence

JOV-8416 extends the existing evidence lifecycle for [JOV-2967](https://linear.app/jovie/issue/JOV-2967).
This package adds validation and pure reconciliation, with no new run ledger,
queue, scheduler, lease owner or runtime writer.

Import `@jovie/agent-transport-contracts/learning-evidence`. A source record keeps
its existing `schema` and body and may add one optional `learning` property with
schema `jovie.evidence-learning/v1`. The extension reader calls the original
canonical validator after separating that property. Legacy records remain
readable and return `learning: null`; absence never attests healthy telemetry.

```ts
const { receipt, learning } = parseLearningEvidenceReceipt(sourceRecord, {
  binding: { tenantId, productId, cohortId },
  work: { id: workId, revision: exactGitSha },
});
```

The owner supplies that context from trusted storage/authorization, never from
an untrusted attachment. Product and cohort bindings are not inferred from a
prediction's `scopeId`. Null cohort means exactly null, never a wildcard.
Prediction experiment identity, tenant and any native code revision must also
match. Schema acceptance checks structure and consistency, not authenticity or
permission to commission a producer. Resolve source references through the
existing authorized evidence owner; this package never fetches them.

## Identity, evidence and compatibility

| Source kind | Existing reader | Native identity / revision | Learning work ID |
|---|---|---|---|
| `work-result` | `parseWorkResult` | `orderId` / `orderRevision` | `orderId` |
| `provider-attempt` | `verifyProviderAttemptReceipt` | `receiptId` / `version` | `binding.parentWrunId` |
| `prediction` | `parseDecisionPredictionReceipt` | `predictionId` / immutable revision `1` | `predictionId` |
| `outcome` | `MeasuredOutcomeReceiptSchema` | `outcomeId` / `revision` | `predictionId` |

The producer's stable `source.eventId` distinguishes source deliveries. Metadata
revision and native receipt revision are separate: metadata corrections use
contiguous `revision` / `supersedesRevision`; native evidence remains under its
existing owner's correction rules. Reusing a metadata revision with different
content, rewriting a native source revision, changing immutable work/intent/plan
bindings, or omitting a correction predecessor fails reconciliation. Reordered
object keys are equivalent; ordered attempts are not. Supporting source
revisions cannot be repeated to inflate evidence.

`work.revision` is an exact 40-hex code revision. Intent and plan each carry an ID
and version. Inputs carry reference, digest, freshness and binding. Attempts
carry consecutive ordinals, event kind, resource identities, result and failure
category; errors, retries, waits, fallbacks and outputs retain their order.
Resources distinguish resolved provider/model/account/tool/adapter versions
from unknown or unavailable resolutions. Account references identify opaque
resources, never credentials. Verification records source, CI, review, build,
deploy, runtime and outcome stages separately and binds each declared stage to
the work revision. A source can declare only its relevant stages; omitted stages
are not proof of those stages.

Failure category or method fingerprint, redaction policy/version and source
references are mandatory. References allow bounded HTTPS, `artifact://` and
`record://` locators. Local paths, credentials, queries/fragments, traversal,
encoded payloads and executable references are rejected. The strict metadata
schema carries references/digests, not raw prompts, outputs or errors, and rejects
recognized secret signatures. Producers remain responsible for redaction before
attachment; validation is not a general-purpose secret scrubber.

Provider `contentDigest` continues to cover the original canonical body. Store
and reconcile the attachment in the same source-owned record; do not reseal a
provider receipt or introduce a separate learning log. Existing strict readers
consume `receipt` returned above. They do not automatically understand an
attached property. The root export and dependency-free Eve prediction reader
stay unchanged; commissioning a consumer must explicitly adopt the new subpath.

## Telemetry and learning decisions

Wall time, active compute and opportunity delay use milliseconds; inference cost,
tool cost and subsidies use USD; credits use the source account's credit unit.
Each metric is mandatory and is either `known` with a finite nonnegative value
and evidence reference, or `unknown` / `unavailable` with a reason code. Zero is
measured zero, never a missing-data default. Expected savings carry time and net
USD estimates in the same explicit form; source references must document their
basis and include learner expense when claiming net saving.

Healthy triage requires authorized producer evidence, complete measured
telemetry, fresh inputs, resolved resources, successful attempts, a method
fingerprint and passing declared verification including an outcome. Native
failed work, provider-failure evidence, predictions alone and inconclusive
outcomes cannot validate healthy learning. Unknown telemetry remains available
as anomalous or unassessed evidence rather than disappearing from calibration.

Every decision carries supporting source/work revisions, a scoped applicability
predicate reference, owner, expected savings, rollback information and an
event-driven revalidation trigger. Rollback may be null before compilation.
Candidate, no-change and quarantined decisions preserve insufficient or unsafe
evidence. Reviewed decisions require independent revision-bound review;
compiled decisions additionally require changed artifact revisions and rollback;
consumed decisions require the exact later consumer work revision and binding.
Superseded decisions name a successor and cannot revive. Quarantined decisions
return through candidate and review before recompilation. Use
`reconcileLearningEvidence({ existing, incoming, ownerContext })` against the
source owner's complete metadata history before promotion: it rejects missing
predecessors and skipped reviews, deduplicates redelivery, and reports changed
source event IDs for existing owners to revalidate affected consumers. A single
schema parse is not promotion, causal proof, or permission to execute a predicate.

## Producer ownership and commissioning boundary

Source audit on 2026-10-15; these are code facts, not deployed-runtime proof:

| Evidence | Existing source owner | Learning attachment status |
|---|---|---|
| Coding/reasoning lane evidence | Python [lane_runner.py](../../scripts/lanes/lane_runner.py), [execution_attempt.py](../../scripts/lanes/execution_attempt.py), and [reason_lane.py](../../scripts/lanes/reason_lane.py); existing source ledgers retain their owners | Uncommissioned |
| Canonical work results | [work-order-adapters.ts](work-order-adapters.ts): `fromLaneRun`, `fromReasoningResult`, `fromSummerCard`; founder decisions remain Summer/Ovie-owned | Uncommissioned |
| Eve provider attempts | [provider-attempt-receipt.ts](provider-attempt-receipt.ts) preserves `sourceOwner`; repository call-site audit finds contract/test support, no commissioned runtime writer | Uncommissioned |
| Prospective predictions | Eve [summer-bottleneck-loop.ts](../../apps/eve-pilot/agent/lib/summer-bottleneck-loop.ts); decision-time owner remains unchanged | Uncommissioned |
| Pilot predictions/outcomes | [pilot-receipts.ts](../../apps/web/lib/activation/pilot-receipts.ts), activation owner; [prediction-outcome.ts](prediction-outcome.ts) retains native joins/corrections | Uncommissioned |
| Authorized official Elixir learning producer | No authorized producer/adapter established by this change | Uncommissioned |

The epic explicitly locks **official Elixir Symphony only**, while the current
[lanes README](../../scripts/lanes/README.md) calls the Python harness Symphony
and states that Elixir units on Gem are retired/stopped/masked. This discrepancy
is recorded, not resolved by choosing a runtime. This contract authorizes no
runtime replacement, Elixir restart, Python commissioning, producer identity,
policy promotion or weakening of existing review/release controls. Producer
fields use `uncommissioned` until the owning work supplies authorization evidence.
JOV-8417–JOV-8427 retain the epic's downstream producer/triage/compiler/consumer
commissioning obligations; fixtures here cannot satisfy those runtime gates.

**Ship now:** additive contracts, rejection fixtures and explicit ownership.
**Re-evaluate when:** an authorized producer supplies exact runtime/source and
revision-bound end-to-end evidence. **Then:** adopt this reader in that existing
owner, commission only that producer, and verify its consumers and corrections.
