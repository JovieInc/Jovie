# Held-out revision quality replay (JOV-8414)

Ship now: offline observation reporting. Re-evaluate when: JOV-6476's approved
labels and surface calibration plus funded, executed buffered pilot archives
exist. Then: compare the frozen limits through the existing JOV-6414 authority.
This runner purchases no judgments, trains nothing, changes no production route,
and grants no delivery permission. It follows the recorded-receipt convention of
[`jev-task-pilot.mjs`](../../scripts/invariants/jev-task-pilot.mjs).

Current evidence, inspected 2026-10-15: the checked-in writing calibration is
`provisional-2026-09-26`; no approved JOV-6476 label corpus or executed JOV-8413
archive was supplied. The current result is **inconclusive**, with zero executed
quality comparisons and no claimed gain. The synthetic tests prove the report
contract only. JOV-6476's Done status does not replace its missing artifacts.

From the repository root, using the pinned Node/pnpm versions:

```sh
# Missing input deliberately produces the current inconclusive report, exit 2.
node scripts/invariants/jev-revision-report-cli.mjs \
  --json /tmp/revision-quality.json --markdown /tmp/revision-quality.md
# Replay a frozen source-owner projection of existing evidence; no secrets/network.
node scripts/invariants/jev-revision-report-cli.mjs --input /path/to/owner-replay.json \
  --json /tmp/revision-quality.json --markdown /tmp/revision-quality.md
pnpm run-outcome:check
pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts lib/chat/writing-pilot.test.ts
pnpm exec vitest run --config=scripts/vitest.config.mts lib/__tests__/ci-fast-lanes.test.mjs
```

Exit 0 means a completed measurement (`retain` or `eligible-for-bounded-canary`);
exit 2 means inconclusive. Identical input and implementation produce identical
JSON and Markdown. Inputs are limited to 16 MiB, 500 corpus examples/runs, 20,000
characters per text, one revision, and one writer/judge call per phase. Missing,
duplicate, mismatched, shadow-only, unapproved or unbilled evidence cannot yield
a gain. Threshold breaches retain the existing behavior even with higher scores.

The local input schema is `jovie.revision-replay/v1`. This is an archive projection
contract for evidence owners, not another calibration project or an authenticated
ingestion API. Owners must verify original approval and provider receipts before
projecting them. References and hashes bind content; they cannot prove authority.
Never submit model-generated ratings as human labels or put private source text
in a public PR. All hashes use SHA-256 of canonical JSON, except `textSha256`,
which hashes exact UTF-8 text. The executable synthetic projection is in
[`jev-revision-report.test.mjs`](../../scripts/invariants/jev-revision-report.test.mjs).

| Input | Required contents |
| --- | --- |
| `corpus` | `version`, `examples`: unique `id`, `documentId`, `split` (`tuning`/`holdout`), exact baseline `text`, `evidenceSha256`, `scenarios`, `expectedState` (`accepted`/`abstain`/`fallback`). Split by source document; normalized duplicate text cannot cross splits. All nine epic scenarios must occur in holdout, not only tuning. |
| `target` | Existing registry `surfaceId`/`policyVersion`, exact `sourceSha`, resolved `writerModel`/`resolvedModel` (judge), `writerProvider`/`judgeProvider`, `corpusSha256`, `labelsSha256`, and current `rubricSha256`. These bind every record via `targetDigest`. |
| `labels` | JOV-6476 `issue`, `ownerRef`, `labelProvenance: human-adjudicated`, `sourceOwnerApprovalRef`, epoch-ms `approvedAt`, corpus/rubric hashes, unique `rows`. Each row has `id`, `adjudicatorRef`, `labelRef`, `baseline` and `revised` labels. Each non-null label binds `textSha256`, integer 0–4 `usefulness`/`voice` and boolean `factual`; revised labels also declare `introducedDrift`/`preservationFailure`. Missing outputs require null labels. Identical texts must have identical quality/factual labels. |
| `calibration` | Reuse JOV-6476's owner projection described in [readiness](jev-writing-readiness.md): kind, issue, owner/receipt/target identities, non-provisional version, calibrated status, eligible decision, every axis's `minConfidence`, `issuedAt`/`expiresAt`, and `heldout`. Its human-label approval, document sets and holdout digest must match this corpus. `heldout.digest` hashes the holdout example array in corpus order. No thresholds are fitted here. |
| `limits` | Frozen surface limits: epoch-ms `declaredAt`, positive `minPairs`/`minUsefulnessDelta`, nonnegative `minVoiceDelta`, `maxP95LatencyMs`, `maxCostPerExampleUsd`; 0–1 caps `maxFactualFalseAcceptance`, `maxIntroducedDrift`, `maxPreservationFailures`, `maxAbstentionRate`, `maxFallbackRate`. Hash must equal calibration's `heldout.predeclaredLimitsDigest`; `declaredAt === limitsDeclaredAt < openedAt <= issuedAt`. |
| `promptContext` | Verified `ownerRef`/`archiveRef`, tuning-only `documentIds`, arrays `prompts`, `demonstrations`, `revisionInstructions`. Preserve all archived instruction/context text, including approved voice examples; prompts must be nonempty. Normalized held-out text in any of these fields makes the report inconclusive. The current draft supplied as revision data is not a reference example; never include other holdout examples or labels in writer context. |
| `runs` | Exactly one per holdout ID, unique terminal `receiptId`, `ownerRef`/`archiveRef`, `execution: gateway`, epoch-ms `recordedAt`, matching `targetDigest`, `calibrationDigest`, `promptContextDigest`, `revisionCount` (0/1), `failure` (null/`timeout`/`budget`), `baseline`/`revised`. Each phase has exact `text` (or null abstention), `state`, elapsed `latencyMs`, `calls`. A fallback additionally requires `approvedTemplateRef`. Preserve original terminal receipt identities; never rerun a judge to improve this report. |
| `runs[].funding` | Existing approval's `receiptRef`, `status: approved`, matching `targetDigest`, `issuedAt <= recordedAt < expiresAt`, finite nonnegative `maxCostUsd` covering all recorded calls, including failures. A zero-cost run still requires approval. Replay consumes no allowance. |
| Phase `calls` | One per `role` (`writer`/`judge`): unique `requestId`, `status` (`succeeded`/`timeout`/`error`), unique `responseId` on success, resolved `modelId`/`provider`, `latencyMs`, nonnegative integer `inputTokens`/`outputTokens`, actual attributable `costUsd`. Baseline requires successful generation/review; an accepted revision requires successful same-writer generation and independent recheck. Unknown costs remain null, never free. |

Usefulness and voice means include labeled candidates; paired deltas use only
pairs with both outputs. Approved fallback text is excluded from these candidate
comparisons. Factual false acceptance divides accepted false candidates by all
human-labeled false candidates. Drift/preservation divide human-observed failures
by labeled revision candidates. Abstention/fallback divide by matched runs.
Revision distribution and timeout/budget counts retain the run denominator.
Latency uses nearest-rank p50/p95; revised pipeline latency and cost include
baseline generation/review plus the revision/recheck, including failed calls.
Cost reports both known-count and complete-total; unknown billing is inconclusive.
Required protected strata and sufficient paired labels must exist. Zero observed
errors never guarantees rare-event safety; confidence scores are not probabilities.

Reports include corpus/model/rubric/labels, archive, context, limits and local
implementation hashes. The [readiness owner](jev-writing-readiness.md) verifies
the originals before projecting the report and exact pilot receipt digests into
its promotion contract. A favorable report alone is not canary admission.
Archived evidence is checked at its recorded execution time; replaying it later
does not renew approvals. No hosted CI, deployed build or observed runtime proof
is inferred from local tests. Existing selectors run deterministic contracts with
95% line, 90% branch and 100% function floors; gated CI makes no paid calls.
