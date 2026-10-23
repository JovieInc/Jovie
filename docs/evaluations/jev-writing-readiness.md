# Writing pilot readiness handoff (JOV-8415)

Ship now: observation pilot. Re-evaluate when: calibrated held-out evidence and
existing canary admission are available. Then: use the existing bounded promotion
path.

`evaluateWritingReadiness` in
[`jev-writing-readiness.mjs`](../../scripts/invariants/jev-writing-readiness.mjs)
returns `promotion-candidate` or typed `denied` reasons. Both retain observation
mode, disable enforcement/traffic, and grant no send authority. It is a read-only
preflight for the existing JOV-6414 owner, never a new admission authority or an
allowance reservation. Repeated calls consume no money, calls, or cohort slots.

As inspected on 2026-10-15, JOV-6476's Done transition refers to the JOV-3721 PR;
the checked-in confidence floors remain `provisional-2026-09-26`. No calibrated
held-out artifact or JOV-8414 report is present in this checkout. Those absences
produce denial. Issue status, a generated approval, a clean style verdict, or
successful issue creation cannot fill the gap. The deterministic green fixtures
are synthetic contract tests, not human calibration or executed quality proof.

## Owner evidence input

The local JSON input has schema `jovie.writing-promotion-evidence/v1`. This is an
explicit projection contract for the existing evidence owners, not a claim that
JOV-6476/JOV-8414/JOV-6414 already emit these records. Owners must verify the
original artifacts and authority before projecting them. Do not accept this JSON
from a writer, model, or unauthenticated request. Digests bind content; they do
not authenticate it. No producer, signature verifier, provider call, scheduler,
or production control is added here.

`target` binds one `surfaceId` and its current registry `policyVersion`, exact
40-character `sourceSha`, and 64-character SHA-256 identities for
`implementationSha256`, `artifactSha256`, `evidenceSha256`, `rubricSha256`,
`corpusSha256`, and `labelsSha256`. It also binds `resolvedModel` (judge),
`writerModel`, `audience`, `destination`, `artifactKind` (`generated-message` or
`onboarding-template`) and `templateChanges`. The rubric digest must match the
current `WRITING_QUALITY_RUBRICS`. Models are resolved identities, not aliases
inferred from a successful mock. Every record's `targetDigest` is
`writingEvidenceDigest(target)`: SHA-256 of the shared canonical JSON encoding.
No raw text, private contact details, or credentials belong in this projection.

Every owner record carries `kind`, `issue`, `receiptId`, `ownerRef`,
`targetDigest`, and finite epoch-millisecond `issuedAt`/`expiresAt`. Future,
expired, missing, or mismatched evidence denies readiness. Expiry comes from the
existing evidence owner; this helper does not invent a confidence or TTL policy.

| Input | Required owner evidence |
| --- | --- |
| `calibration` | Kind `calibration`, issue JOV-6476, status `calibrated`, non-provisional `version`, decision `eligible-for-bounded-canary`; a finite 0–1 `minConfidence` for every writing axis. `heldout` carries `humanLabelsApprovalRef`, `labelProvenance: human-adjudicated`, disjoint nonempty `tuningDocumentIds`/`holdoutDocumentIds`, `excludedFromWriterPrompts: true`, `digest`, `predeclaredLimitsDigest`, and `limitsDeclaredAt < openedAt <= issuedAt`. These limits remain surface-specific; confidence is not correctness probability. |
| `pilotReceipts` | Nonempty unique records, kind `pilot-receipt`, epic JOV-3722, status `reviewed`, `execution: gateway`, matching `calibrationDigest` and `calibrationVersion`. Preserve original pilot receipt identities in `receiptId`; this projection does not reinterpret incomplete evaluations as reviewed. |
| `report` | Kind `quality-report`, issue JOV-8414, status `eligible-for-bounded-canary`, `execution: gateway`, positive integer `heldoutCount`; owner-computed `comparisonPassed`, `criticalFixturesPassed`, `protectedMetricsPassed` all true. Bind `calibrationDigest`, exact `pilotReceiptDigests`, `heldoutDigest`, and `predeclaredLimitsDigest`. JOV-8414 owns measurements, denominators, reproducible report and predeclared threshold evaluation; this helper does not recalculate them or invent materiality limits. |
| `admission` | Kind `canary-admission`, issue JOV-6414, status `admitted`, existing `authorityRef`, exact `reportDigest`, `calibrationDigest`, and `pilotReceiptDigests`. `fundingApproval` and `privacyApproval` each carry fresh `issuedAt`/`expiresAt`, `receiptRef`, status `approved`, and matching `targetDigest`. These are projections of existing approvals, never approvals created here. |
| `admission.allowance` | Explicit unique `cohortIds`, positive integer `maxCohortSize`/`maxCalls`, nonnegative integer `usedCohortSize`/`usedCalls` below their limits, finite nonnegative `maxSpendUsd`/`spentUsd`/`nextCallUpperBoundUsd`. The next call must fit; a zero-cost funded allowance still has bounded calls/cohort. Existing admission owns durable usage and permitted funding. |
| Operational evidence | `admission.monitoring`: fresh `receiptRef`, status `healthy`. `rollback`: fresh `receiptRef`, `targetRef`, `certified: true`, `eligible: true`. `killSwitch`: fresh `receiptRef`, `tested: true`, `active: false`. All use `issuedAt`/`expiresAt`; `protectedMetricRegression` and `cancelled` must explicitly be false. |
| `hostedCi` | Fresh `issuedAt`/`expiresAt`, `receiptRef`, status `passed`, and `sourceSha` equal to the target. Local checks cannot substitute for this exact-head hosted evidence. |

## Protected template promotion

Each template change names `lineKey`, `stepId`, `textSha256` (exact UTF-8 text),
and `promotionReceiptId`; `onboarding-template` requires nonempty changes. The
helper reads the existing protected merged receipt ledger and invokes
[`evaluatePromotionGate`](../../apps/web/lib/onboarding/promotion-gate.ts).
It requires the exact protected eval head/run, north-star cohort gate and latest
active line text. A later rollback, absent ledger, changed text, failed protected
check or regressed holdout denies the candidate. The injected ledger reader is a
trusted-source testing seam, never a model approval input. Existing merged-PR,
CODEOWNERS, protected replay and serving controls remain authoritative.

## JOV-3723 consumption and proof boundaries

An eligible `handoff` names JOV-6414 as promotion owner and JOV-3723 as delivery
boundary owner, plus target, calibration, report, admission and pilot receipt
digests. Its expiry is the earliest expiry of all required evidence. The existing
owner must revalidate identity, eligibility, data/funding policy and durable
allowances at dispatch; readiness does not mint or spend a lease.

JOV-3723 must still check the exact delivered content, audience/destination,
evidence freshness, policy and resolved model immediately before delivery. Any
edit, cancellation, stale receipt or late result invalidates the prior review.
Existing authorization, deduplication, approved fallback/review queue and outbound
authority continue to govern sending. Templates additionally require the protected
promotion path above. See the [surface contract](../writing/SURFACE_COVERAGE.md).

`proof.localPreparation` identifies this readiness implementation and the supplied
target source; `proof.hostedCi` reports only the separately supplied exact-head
CI receipt. `proof.deployedBuild` and `proof.observedRuntime` always say `absent`
in this preflight. Even a candidate has no deployed runtime proof. An authorized
deployment and canary must attach their exact build and observed outcome receipts
through the existing JOV-6414/JOV-3723 path; source, tests and CI cannot infer them.

Run without secrets or network from the repository root:

```sh
node scripts/invariants/jev-writing-readiness.mjs /path/to/owner-evidence.json
pnpm run-outcome:check
```

The CLI exits 0 for a candidate and 1 for denial, including unreadable/invalid
JSON. The existing script CI selector and `run-outcome:check` run failure-path
coverage without paid calls; the readiness module has 95% line, 90% branch and
100% function floors. Tests cover provisional/missing/stale/wrong-surface evidence,
model/rubric/receipt changes, held-out contamination, exhausted allowances,
rollback/kill-switch conditions, protected template gates, and proof separation.
