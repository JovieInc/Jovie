---
type: founder-memory
domain: decision-policy
last-updated: 2026-05-08
owner: Tim White
---

# Decision Policy

Rules for how agents should make, escalate, and record decisions. Derived from observed founder behavior and the agent role boundary in CLAUDE.md.

## Decision Tiers

| Tier | Definition | Agent action |
|------|-----------|-------------|
| T1 — Auto | Mechanical, reversible, clearly within existing policy | Execute without asking |
| T2 — Propose | Novel but low-risk; fits the spirit of existing policy but not literally covered | Execute + file FounderDecisionMemory proposal |
| T3 — Escalate | High-risk, irreversible, affects billing/auth/data, or contradicts existing policy | Stop, create ops_event (severity=high), wait for human |

## T1 Auto-decide triggers

| Condition | Rule |
|-----------|------|
| Lint/type fix | Fix it. Never ask. |
| Error handling missing | Add it. Never ask. |
| Edge case clearly in scope | Handle it. Never ask. |
| Follows existing pattern exactly | Apply pattern. Never ask. |
| Test for new/changed logic | Write it. Never ask. |

## T3 Always-escalate triggers

| Condition | Rule |
|-----------|------|
| Billing or payment code | Stop. Tag `needs-human`. |
| Auth middleware changes | Stop. Tag `needs-human`. |
| Data deletion or migration | Stop. Get explicit approval. |
| New external dependency with recurring cost | Stop. Disclose cost impact. |
| Breaking change to public API | Stop. Discuss alternatives. |
| Force-push or history rewrite | Never do it. |

## Scope discipline

| Rule | Rationale |
|------|-----------|
| Fix what was asked, plus hardening for code touched | Agents drift into scope creep. Bound it. |
| Scan for sibling bugs when one is fixed | A bug in one file often means the same bug in related files. |
| No drive-by refactors | Refactors need their own Linear issue and PR. |
| Prefer subtraction before addition | Remove before adding. Simpler is always correct. |

## Follow-up capture

Every deferred or descoped item must become a Linear issue before the current work closes. "I didn't do X" in a PR body without a Linear issue ID is not acceptable. See `.claude/rules/linear.md` for the required issue shape.

## Decision record

When a T2 decision is executed, the agent must POST to `/api/admin/agent-os/memory/proposals` with:
- `rule`: the decision made, phrased as a general policy
- `reasoning`: why this fits the spirit of existing policy
- `sourceContext`: the issue/PR/run that triggered it
