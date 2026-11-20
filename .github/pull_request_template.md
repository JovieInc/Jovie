## Summary

Before:

After:

<!-- Required: the Linear issue this PR serves (Linear is the system of record).
     Find or create it BEFORE starting work. One line per issue; LYB-/SYM- keys also work. -->
Refs JOV-

## Verification

<!--
Customer changelog decision (required by Source Validation; see docs/CHANGELOG_PUBLICATION.md).
Keep the internal default below, or replace it with a customer outcome block when the change is user-visible.
-->
<!-- customer-changelog/v1 {"releaseWorthy":false} -->

## Guardrail

<!--
Required (canon/COMPANY.md "Guardrail with every fix"; checked by guards/plugins/guardrail-section.mjs).
Trivial change? Cite the existing guard in Existing instead of inventing one.
-->
- Class:
- Mechanism: <!-- or Existing: <check id or path> -->
- Enforced at:
- Heals: <!-- auto action, or n/a -->
- Status: NOW <!-- or LATER <issue link> -->
- Simulation: <!-- trivial / high-volume / literal-or-gaming; desired result; worst case + why acceptable -->
- Encoded in: <!-- per review finding: token / component / lint / snapshot / fixture path, also appended to the review-findings ledger; else n/a -->

## Win

<!--
Optional. Fill in when this PR has a measurable before/after; merged PRs with a valid section are
recorded automatically in canon/wins/wins.jsonl (docs/operations/WINS_LEDGER.md). Otherwise leave "n/a".
One Metric line per number: name | unit | lower or higher | before | after | source | query
Required for PRs labeled `compounding` and for ci/perf/throughput changes (Fleet Rules prints a template).
After-value measured once live: use `?` for after and add `- Pending: yes`. Add `- Per-merge: yes` when every merge pays the saving.
-->
n/a

<!-- Ready / auto-merge: promoted automatically at ≥90% estimated clean landing (squash auto-merge armed); no human approver. Delete the next line only to park a work-in-progress draft. -->
<!-- jovie-auto-ready: on-green -->
