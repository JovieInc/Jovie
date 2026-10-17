---
id: 2026-10-16-testflight-main-advance-starvation
status: draft
severity: sev3
detected: 2026-10-16T08:00Z
repaired: unverified
failure_classes: [non-convergent-control-loop, pre-merge-parity-gap, green-by-implication]
detectable_before_human: true
detection_gaps: [missing-invariant]
replay_corpus: [apps/web/tests/unit/ci/ios-testflight-authorization.test.ts]
founder_rescues: 0
incident_issue: JOV-8515
actions: [JOV-8515]
gbrain: ops/postmortems/2026-10-16-testflight-main-advance-starvation
---

# Verified TestFlight sources starved while main advanced

Author: founder-operated Codex, JOV-8515. Review: Summer. Process: [README](README.md).

## Summary

The TestFlight workflow required its certified source to equal the moving main head at admission, archive and upload. Continuous merges repeatedly invalidated otherwise exactly verified sources before the serial lane could finish. The repair pins one recent certified ancestor, preserves the existing simulator and upload gates, and re-proves authority at each irreversible boundary. Runtime recovery is still unverified. This incident record and its machine-read rescue count cover the observed repair window beginning at ownership acceptance, approximately 08:00 UTC; earlier runs are context, and earlier rescue totals are unverified and excluded.

## Impact

| Measure | Value |
| --- | --- |
| Start / time to detect | Unverified; earlier run timestamps were not independently established by this writer. |
| Time to own | Bounded repair accepted and recorded on JOV-8515 at approximately 08:00 UTC, after the prior owner released scope at 07:56 UTC. |
| Time to repair | Unverified pending executed simulator and upload receipts. |
| What was blocked | Exactly verified iOS generations could skip native work; workflow success alone did not establish an archive, upload, processing or distribution. |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| Before ownership; exact times unverified | Delegated incident evidence identified repeated skipped generations. | Runs [38847261511](https://github.com/JovieInc/Jovie/actions/runs/38847261511), [38853480413](https://github.com/JovieInc/Jovie/actions/runs/38853480413), [38855760024](https://github.com/JovieInc/Jovie/actions/runs/38855760024), [38857295646](https://github.com/JovieInc/Jovie/actions/runs/38857295646), [38861292449](https://github.com/JovieInc/Jovie/actions/runs/38861292449); run-level details beyond the delegation remain unverified. |
| 07:56 | Prior auth owner released TestFlight scope, as recorded in the delegation. | JOV-8515 ownership checkpoint. |
| Approximately 08:00 | Fresh branches/claims checked; isolated repair accepted. | JOV-8515; unrelated primary edits preserved. |
| During repair | The old workflow failed the continuous-main-advance regression; fixed workflow and real Ruby guard passed their focused suites. | `ios-testflight-authorization.test.ts`; guard Node suite; PR #22037 and its dependent activation PR. |

## Root cause

The admission and archive shell guards in `ios-testflight.yml`, plus Fastlane's final upload guard, equated freshness with `releaseSHA == main`. That predicate cannot remain true across normal merges throughout a simulator run and archive. Workflow transport metadata was also used as an uploaded-source identity; allowing an ancestor safely first required separating those identities throughout authorization, recovery and receipts.

## Contributing causes

The lane already serialized releases, but had no bounded pinned-release policy. Artifact retention did not define certification validity or revocation. Existing authorization tests did not replay main advancing between successful certification and later release boundaries.

## Failure classes and invariants violated

| Class | Invariant that should hold | Similar surface |
| --- | --- | --- |
| non-convergent-control-loop | One recent exactly verified mainline source can finish despite unrelated merges; latest pending then catches up. | Long native release lanes using a mutable-head equality guard. |
| pre-merge-parity-gap | Tests execute the workflow authorization and upload guard with distinct source and transport heads. | Release receipt readers and recovery paths. |
| green-by-implication | A skipped native job is never presented as an executed upload or distribution. | Production-to-native handoffs and final issue closure. |

## Why detection failed

The source predicates exposed a deterministic starvation mechanism, but the existing regression suite lacked this interleaving. The new test executes the actual shell from the workflow with an authenticated certified source and a later main head; the pre-fix workflow returns `authorized=false`, while the repaired path progresses. The pre-ownership detector history and any earlier founder rescues are unverified; zero new founder rescue was required during this implementation.

## Instance fix

PR #22037 adds the guarded lease and CI selection. Its dependent activation PR wires authorization, immutable intent, full simulator regression, archive/final-upload revalidation and source-bound receipts. A lease expires 140 minutes after the exact Production Verified job completion, derived from the existing 10 + 55 + 75 minute critical-path budgets, without renewal. Current-main policy can revoke a source or all leases. Source, both transports, admission main and uploaded-source frontier must retain authoritative ancestry.

## Systemic controls

1. JOV-8515 covers every consumer within this TestFlight lane: automatic/manual admission, simulator eligibility, archive, the real Fastlane upload guard, binary attestation, marker publication and recovery. Immutable intents fence duplicates and uncertain uploads; baseline buckets plus bounded successor traversal prevent late old receipts from hiding newer reservations. Strict tests cover continuous merges, expiry/revocation, rewrites/divergence, malformed or incomplete evidence, source/transport mismatches, duplicate/replayed uploads and the latest pending generation's complete iOS delta. Other product release policies retain their own authority; this repair does not change them.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| JOV-8515 | Bounded certified-source lease, all TestFlight consumers and deliberate-red replay. | non-convergent-control-loop | In progress; source review and runtime delivery pending. | Old workflow fails the new regression locally; production simulator/capture/upload unverified. |

## Open questions and unverified claims

Exact outage duration, prior distribution state and pre-ownership run details remain unverified. A denied read of production run 38869365703/job 116869562776 was explicitly out of scope and was not retried or bypassed. Actual upload success, Apple processing/distribution and physical-device behavior require separate receipts. The GBrain mirror is pending because the configured local MCP initialization transport was unavailable and direct fallback is disabled; the repository draft remains canonical.
