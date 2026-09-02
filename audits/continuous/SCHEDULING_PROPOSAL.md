# Continuous audit scheduling proposal

Status: **proposal only**. No workflow, cron, Codex automation, provider
credential, or production setting was created or changed.

## Event lane

Run the registry validator and changed-partition planner on relevant source
changes. This lane is deterministic, local, and capped at two minutes. It does
not call a model or file findings.

## Daily bounded lane

Reuse one existing read-only operational window after current CI and queue
receipts settle. Select the highest weighted due partition that fits its family
budget. Run deterministic probes first. Stop if evidence is unavailable rather
than expanding into a full-repo scan.

Model review is opt-in per selected run. It requires a fresh provider
qualification receipt, a sanitized scope manifest, a zero-cent default spend
cap, and a direct-evidence validator. Hyperagent remains ineligible until all
qualification receipts pass; its failure never triggers provider substitution.

## Weekly coverage lane

Review the coverage ledger, overdue partitions, unresolved finding expiries,
provider disagreement samples, and recurrence proof. Select only missing or
high-risk slices. Do not repeat a full scan that has fresh unchanged evidence.

## Monthly acceptance review

Review family acceptance states and promote repeated validated findings into a
test, metric, or typed receipt. Retire probes that create duplicate noise or no
longer cover a live risk. Rebalance weights from incidents and code churn.

## Proposed resource ceiling

| Resource | Ceiling |
|---|---:|
| Deterministic daily wall time | 45 minutes total |
| Concurrent model runs | 1 |
| Model runs per selected scope | 2 |
| Default incremental model spend | $0 |
| Findings without direct evidence | 0 |
| Customer-data or secret-bearing inputs | 0 |
| Full-repo model scans | 0 |

## Activation gate

Activation requires one explicit authorization naming the chosen host and
schedule. The activation change must show the exact workflow or automation,
permissions, concurrency, cost cap, artifact retention, failure notification,
and rollback. Approval of this proposal is not authorization to create the job.
