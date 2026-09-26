# Backlog hygiene receipt — 2026-09-26 (JOV-5555)

Machine-readable post-pass inventory: `audits/backlog-hygiene-inventory-2026-09-26.csv` (columns: identifier, state, createdAt, updatedAt, priority, assignee — one row per active issue; timestamps truncated to date precision to stay under the repo combined-tree byte budget).

## Before / after

| Snapshot | Active | Backlog | Todo | Triage | In Progress | In Review | Rework | Duplicate |
|---|---|---|---|---|---|---|---|---|
| Before | 1,734 | 981 | 265 | 14 | 164 | 46 | 7 | 257 |
| After | 1,692 | 966 | 265 | 14 | 158 | 23 | 3 | 263 |

Delta: −42 net active (−46 mutations attributable to this pass; +4 records created or reopened by concurrent automation during the pass).

## Mutations (46)

Each mutation was preceded by an evidence comment on the issue, then the state change. All Linear API receipts returned `success: true`.

### Closed resolved — linked PR merged on main (30)

JOV-6524 (PR #17795), JOV-6523 (PR #17761), JOV-6519 (PR #17156 — previously held; merged 2026-09-25), JOV-6515 (PR #17762), JOV-6511 (PR #18068), JOV-6510 (PR #18130), JOV-6276 (PR #17531), JOV-6007 (PR #16370), JOV-5750 (PR #16774), JOV-5749 (PR #16144), JOV-5738 (PR #16137), JOV-5736 (PR #16378), JOV-5735 (PR #16392), JOV-5727 (PR #16527), JOV-5718 (PR #16694), JOV-5712 (PR #16749), JOV-5711 (PR #16768), JOV-5710 (PR #16754), JOV-5704 (PR #16780), JOV-5703 (PR #16782), JOV-5702 (PR #16783), JOV-5699 (PR #16793), JOV-5697 (PR #16852), JOV-5691 (PR #16519), JOV-5641 (PR #16425), JOV-5625 (PR #16354), JOV-5164 (PR #15907), JOV-4567 (PR #15115), JOV-4300 (PR #8496), JOV-2173 (PR #8585).

### Canceled obsolete — linked PR closed unmerged (10)

JOV-6516 (PR #17838), JOV-6514 (PR #17802), JOV-5730 (PR #16525), JOV-5695 (PR #16523), JOV-5693 (PR #16521), JOV-5658 (PR #16846), JOV-5644 (PR #16458), JOV-4108 (PR #8512), JOV-2499 (PR #9091), JOV-1961 (PR #8159).

### Marked duplicate — exact title + fingerprint match, canonical kept open (6)

- JOV-4190 → duplicate of JOV-6214 ("Failed query: rollback … set_config statement_timeout", canonical In Progress)
- JOV-4206 → duplicate of JOV-4318 ("Failed query: select id, gate_enabled …", canonical Todo; JOV-3353 In Review)
- JOV-4457 → duplicate of JOV-6123 ("Failed query: rollback", canonical In Progress)
- JOV-2227 → duplicate of JOV-2228 ("Epic: AI connector — calendar magic moment v1", both were Backlog)
- JOV-1853 → duplicate of JOV-1905 ("OPS: Default-alive war room", both were Backlog)
- JOV-5094 → duplicate of JOV-3993 ("Error: UpstashError", oldest open kept canonical)

Duplicate relations were created via `issueRelationCreate` before the state transition, per Linear's state requirements.

## Candidates inspected

- 1,734 active issues snapshotted; 1,105 aged >30 days at baseline (1,098 after).
- 38 normalized-title duplicate groups examined; only the 6 pairs above met the bar (overlapping surface/root cause + open canonical). Groups already in `Duplicate` state were not re-touched.
- All 56 `[PR #xxxx]` titled issues cross-checked against live GitHub PR state via `gh`.
- Aged In Progress items (>30 d): retained — no resolution receipt found; per policy, absence of update is not proof of completion. Several are deliberate standing governance/audit epics.

## Sentry

Sentry evidence path unavailable this pass (Sentry MCP down; no Doppler token in this environment). Per issue policy, no Sentry-only issue was closed — closure requires current non-recurrence evidence. Recorded as `sentry-mcp-unavailable`; Sentry-only stale items were preserved.

## Queue / exceptions

- Todo depth: 265 — above the 2× Symphony concurrency invariant.
- JOV-5555 itself: recurring governance loop; remains open (not marked Done).
- Strict preserves: no customer/security/finance/legal/release/incident issues were closed without a merged-PR or duplicate-relation receipt.
- Rework depth: 3 items remain after this pass (JOV-6516 and JOV-6514 were canceled as dead review mirrors; JOV-6515 closed resolved). Remaining Rework items need owner attention — flagged for next pass.
