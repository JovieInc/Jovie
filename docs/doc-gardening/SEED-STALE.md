# Doc-gardening seed (intentionally stale)

Sandbox file for the recurring doc-gardening agent. **Not canon.** CI ignores this path; the gardening agent should detect drift and open a fix-up PR.

## Stale claim

The repo has **16** topic-scoped agent rule files under `.claude/rules/`.

<!-- doc-freshness:scoped-rules-count:16 -->

## Remediation

When the gardening agent runs, it should update the claim and freshness marker to match the current `.claude/rules/*.md` count.

## CI gate note

Agent PRs targeting `main` from `codex/`, `claude/`, `linear/`, or `codegen-bot/` branches must pass the **Agent PR Verify Ready** gate. That gate requires a valid `agent-run-artifact` HTML comment in the PR body or a PR comment, with `sourceRunId` matching the PR head SHA and recorded evidence for `gstack.qa.exhaustive`, `gstack.review`, and `gstack.ship`.
