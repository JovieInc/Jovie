# Continuous audit scheduling proposal

Status: **family schedules remain proposal only**. One bounded registry and
coverage-integrity pilot is active on trusted `main` push events through the
existing CI workflow. It is not a daily, weekly, monthly, or model schedule.

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

The founder authorized the integrity pilot on Gem with event-driven triggers,
zero external model calls and spend, three-day evidence retention, Ovie-only
notification, and automatic disable on a bad or malformed receipt. The exact
machine-readable boundary is `activation.json`. Its five-minute lease becomes a
latched disable on the next event if the runner disappears; successful terminal
attestation closes the lease to `idle`, and Ovie accepts only that attestation
after the exact-current-main receipt has been preserved.

Every deeper family schedule above remains unapproved. Expanding cadence,
permissions, providers, spend, retention, data egress, notification destination,
or production behavior requires another reviewed activation decision.
