# Profile completeness certification

Status: implementation draft; production activation blocked on an admitted evaluation producer and an impact read. This is separate from the tested Presence repair in PR #18016.

## Decision

Compose existing creator profiles, source attributes, active social links, lead ingestion, and the shared Jev evaluator. Store one server-owned judgment on the profile; do not build a second registry, controller, identity service, or billing entitlement. Directory inclusion and outbound eligibility consume the same deterministic assessment.

The differentiating product rule is that an incomplete generated profile must not be promoted into discovery or outreach. Identity ownership, publication, billing, and completeness remain independent decisions. A completeness denial does not delete a profile or disable its direct public page. Existing claimed/public/QA filters continue to apply to the directory.

## Recommended v1 threshold

Recommend 100/100: five mandatory dimensions at 20 points each — credible identity, non-placeholder photo URL, meaningful descriptive content, active public destinations, and recorded creator/public-source provenance. Every dimension is mandatory; a model pass cannot compensate for one missing dimension. This is a proposed completeness score, not Tim's chosen numeric threshold or a model confidence score.

Synthetic calibration includes complete generated and creator-managed profiles; photo-less, placeholder, missing-source, and missing-destination profiles; stale/malformed/failed/replayed judgments; and profile edits during evaluation. Those cases justify the conservative hard gate but do not measure real-model accuracy. URL syntax validation does not prove image availability, source correctness, or a successful provider request.

Jev must return a matching supported judgment. Unknown, failed, absent, contradicted, insufficient, future-dated, and expired evidence deny eligibility. The receipt binds the policy version, profile ID, canonical content SHA-256, and revision. v1 freshness is provisionally 24 hours. Current reads recheck content and expiry; no stale directory cache serves a previous eligibility result.

Re-evaluate the threshold and freshness window after an authorized representative production assessment set provides false-accept/false-reject evidence. Then adjust the versioned policy and require reassessment; do not reinterpret old certificates under a new policy.

## Producer and concurrency

The shared Jev server adapter owns transport admission and model execution. Consumer code must never manufacture approval, use a default model verdict, or silently fall back to another model. Snapshot data includes public profile content and provenance, without email addresses, claim tokens, billing, or private settings.

`reassessProfileCompleteness` skips incomplete/current profiles, calls the admitted adapter outside a database transaction, rereads the snapshot, and stores the judgment only if the profile revision and previous judgment still match. Edits to links or provenance invalidate the digest at the next consumer read, including edits racing persistence. Repeated enrichment can be reassessed; an earlier denial is not a permanent rejection.

The current implementation does not establish unattended production evaluation authority. Existing ingestion jobs and cron are the preferred scheduling substrate once the adapter's admission contract can authorize the exact snapshot and current source. Do not run model transport inside the legacy ingestion transaction.

## Release order and unresolved gates

1. Refresh aggregate production impact using an authorized read-only database surface: public/claimed profile count, missing photo/content, approved leads, and pending email/DM candidates. Counts are currently UNKNOWN because the previously installed query connector is not callable. Do not extract credentials or bypass denied Doppler access.
2. Deploy the additive nullable judgment migration and the shared evaluator/producer without promoting the consumer enforcement change. No receipt is implied by a schema migration.
3. Obtain the exact transport admission required by the shared evaluator, evaluate representative profiles, inspect model results, and backfill the intended complete population. Record source SHA, snapshot hash, policy, result, persistence/read-back, and remaining denials. This is not permission to send outreach.
4. Verify reassessment after a profile edit and the recurring freshness path. An initial backfill is insufficient if all receipts expire without renewal.
5. Deploy the directory and send-boundary enforcement only with that producer operational and the measured impact reviewed. Missing required data remains denied; do not introduce an allow-by-default rollout flag to hide missing evidence.
6. Verify deployed directory output, direct-page continuity, and blocked outbound paths without sending unsolicited messages. Model commissioning, runtime behavior, and source test results are separate receipts.

Until steps 1–4 are satisfied, do not activate the enforcement release or call it production-ready. With no valid stored judgments it would exclude the entire directory candidate set and block outreach eligibility. The exact population is unknown, not zero.
