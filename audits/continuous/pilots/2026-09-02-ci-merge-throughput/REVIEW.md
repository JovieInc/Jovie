# CI and merge throughput pilot review

Status: **DONE_WITH_CONCERNS**

## Outcome

The pilot proved the registry can run against bounded current evidence without a
model, external job, credential change, production mutation, customer-data
transfer, or secret transfer.

One finding passed direct-evidence validation and deduplication: the native
queue held 76 entries, above the pilot threshold of 50. It is marked **blocked**,
not fixed, because queue depth alone does not prove the controlling bottleneck
and this audit has no mutation authority.

## Proof ladder

| Tier | Result | Meaning |
|---|---|---|
| Source | Verified | Pilot checkout `94e9e19c…` and current `origin/main` `ccb8868d…` were kept separate. |
| CI | Verified | Exact-main run 33591655643 succeeded. Its direct-main event skipped change-selected source and merge-group lanes, so it is not described as a full-suite run. |
| Queue | Verified | Native queue snapshot reported 76 entries; repository had 153 open PRs. |
| Deploy | Observed only | Current-main controller was queued; four prior controller runs were failures. No Production Verified claim. |
| Runtime | Availability only | `/api/health` returned HTTP 200, without immutable deployment or source-SHA parity evidence. |

## Model disagreement lane

No model was called. That is intentional: deterministic evidence was sufficient
for the queue-depth claim, and no second-provider review was needed to count
queue entries. The runner supports provider-diverse comparison but rejects any
model finding without a fresh qualification receipt and direct evidence.

Hyperagent remains unqualified. Authentication, exact model identity, read
boundary, secret/customer-data exclusion, cost cap, fixture eval, and structured
output receipts are all required before use. Failure does not substitute another
provider.

## Concerns retained

- The queue-depth finding does not identify root cause.
- The current production controller lacked a terminal success at observation
  time. That signal belongs to the runtime/production-health family and is not
  silently promoted into this pilot's finding set.
- Public HTTP 200 is availability evidence, not exact-build runtime proof.

## Acceptance

Accept the registry and pilot as a local evidence contract. Do not activate the
scheduling proposal until an explicit authorization names the host, cadence,
permissions, resource ceiling, retention, and failure notification.
