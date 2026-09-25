# PR Workflow Guide

> **Retired 2026-09-25 (JOV-5426):** this guide described a label-driven
> auto-merge flow (`auto-merge` label fan-out, manual production promotion)
> that no longer exists. Current truth:

- **How PRs land:** [`docs/PR_FLOW.md`](./PR_FLOW.md) — open a draft, keep the
  exact head green, then request GitHub's normal **Merge when ready**; the
  native merge queue owns admission. There is **no `auto-merge` label**, no PR
  label fans out CI, and there is no production-promotion branch or manual
  promotion lane. Queue semantics: [`.github/MERGE_QUEUE.md`](../.github/MERGE_QUEUE.md).
  Required status checks: [`.github/BRANCH_PROTECTION.md`](../.github/BRANCH_PROTECTION.md).
- **Linear issue state:** the [Linear Ownership Contract](../.claude/rules/linear.md)
  governs the three-state flow — mark the issue `In Progress` before editing
  (Symphony records it in the lease; ad-hoc agents do it manually), move it to
  `In Review` when you open the PR (or require the lease-handoff receipt), and
  **never** set `Done` yourself: `linear-sync-on-merge.yml` auto-transitions it
  on merge. Preserve the PR body's `<!-- linear-issue-id:... -->` comment
  (injected by `.github/workflows/auto-pr-on-push.yml`) and the `jov-XXXX`
  branch pattern so the merge workflow can find the issue.

Keep PRs small, focused, and conventional-commit formatted.
