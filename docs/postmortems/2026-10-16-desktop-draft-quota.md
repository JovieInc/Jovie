---
id: 2026-10-16-desktop-draft-quota
status: draft
severity: sev3
detected: 2026-10-16T21:36Z
repaired: unverified
failure_classes: [pre-merge-parity-gap, serial-layer-discovery]
detectable_before_human: true
detection_gaps: [missing-invariant, insufficient-diagnostics]
replay_corpus: [scripts/desktop-release-publisher.test.mjs]
founder_rescues: 0
incident_issue: JOV-8374
actions: [JOV-8374]
gbrain: ops/postmortems/2026-10-16-desktop-draft-quota
---

# Desktop draft preparation failed on installation quota

Author: Codex, JOV-8374. Review: Summer. Process: [README](README.md).

## Summary

Production desktop draft preparation failed on GitHub's installation quota.
The earlier bounded read retry remains present. It cannot wait beyond its
600-second budget, and preparation lacked the explicit deferral already used
by authorization. This source repair does not establish production recovery.

## Impact

| Measure | Value |
| --- | --- |
| Observed failure | 2026-10-16 21:36:37 UTC |
| Time to detect | Summer reported the recurrence within 14 seconds |
| Time to own | In Progress receipt at 21:40:05 UTC |
| Time to repair | Unverified; independent landing and live reconciliation pending |
| What was blocked | Preparation for release `v26.10.9`, source `89b5564a3f8738a073592864f98e1dc7c3ae230e`; packaging and publication were skipped |

## Timeline (UTC)

| Time | Event | Evidence |
| --- | --- | --- |
| Oct 15 | Provenance retries merged and remain present. | PR #21769, merge `3d9cdeb330a` |
| Oct 16 02:49 | Release GETs gained bounded quota holds. | PR #21981, merge `f87f17eb867` |
| 21:33:49 | Publisher checked out the exact authorized source. | [Job 117206329472](https://github.com/JovieInc/Jovie/actions/runs/38970125431/job/117206329472) |
| 21:36:37 | GET `/releases/tags/v26.10.9` returned installation HTTP 403; no hold was logged. | Same job, Prepare private production draft |

## Root cause

Installation quota exhaustion made release metadata unavailable. The executing
source already contains the earlier fixes; this was not a reverted retry.
The retained log omits response headers, so a reset beyond budget versus
missing reset evidence is **unverified**. Both previously produced the same
generic failure. A known reset beyond budget now defers preparation; missing
reset evidence remains fatal and its header state is logged.

## Contributing causes

Authorization and preparation had different dispositions for quota exhaustion.
Existing tests covered nearby reset recovery and fatal exhaustion, but did not
exercise the producer CLI and its workflow preparation output together.

## Failure classes and invariants violated

| Class | Invariant that should hold | Similar surfaces |
| --- | --- | --- |
| pre-merge-parity-gap | A known infrastructure deferral cannot claim package or publication success. | Signing, packaging, asset verification, publication and publisher identity |
| serial-layer-discovery | Trace the next release boundary after repairing provenance reads. | Authorization, draft preparation and published-release verification |

## Why detection failed

Tests asserted that exhaustion always failed the read. They did not distinguish
safe preparation deferral from publication proof. The new regression executes
the real CLI under quota, permission, mutation and retry scenarios, and failed
against the original producer. Workflow assertions separately enforce the
preparation gate; those assertions are structural evidence.

## Instance fix

Known installation-quota resets beyond budget yield `prepared=false` and a
warning containing the reset instant and exact source. Successful preparation
alone emits `prepared=true`. Every subsequent production step requires it.

## Systemic controls

The existing empty publisher-output gate prevents a deferred build from writing
a publication receipt. Nearby resets retain bounded retry. Missing resets,
permission failures, exhausted attempts, mutations, staging preparation and
published-release verification retain failure behavior. No wait budget, job
timeout, authorization, signing or asset-proof gate is relaxed.

## Action items

| Issue | Control | Class | State | Live verification receipt |
| --- | --- | --- | --- | --- |
| JOV-8374 | CLI regression and preparation gates through publisher identity | pre-merge-parity-gap | Source repair; independent gate pending | unverified |

## Open questions and unverified claims

Main, merged source, actual publication and installed native revision remain
distinct and unverified here. A deferred run is not publication evidence.
The original response's reset headers cannot be recovered from its log.
GBrain is unreachable (`gbrain-unavailable`); this repository record is durable.

**Ship now:** bounded preparation deferral and explicit downstream gates.
**Re-evaluate when:** the first post-landing publisher runs.
**Then:** inspect the exact source, reset diagnostics and publication receipt.
