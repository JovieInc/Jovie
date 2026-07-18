# Doc-gardening seed (intentionally stale)

Sandbox file for the recurring doc-gardening agent. **Not canon.** CI ignores this path; the gardening agent should detect drift and open a fix-up PR.

## Stale claim

The repo has **16** topic-scoped agent rule files under `.claude/rules/`.

<!-- doc-freshness:scoped-rules-count:16 -->

## Remediation

When the gardening agent runs, it should update the claim and freshness marker to match the current `.claude/rules/*.md` count.

## CI gate note

The former **Agent PR Verify Ready** workflow is retired because it duplicated source-PR CI and could promote a newer draft from a stale run. Canonical `CI / PR Ready` evidence plus the current-head Auto-Ready controller now own draft promotion.
