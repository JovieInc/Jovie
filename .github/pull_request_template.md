## Summary

Refs JOV-

## Verification

<!--
Customer changelog decision (required by Source Validation; see docs/CHANGELOG_PUBLICATION.md).
Keep the internal default below, or replace it with a customer outcome block when the change is user-visible.
-->
<!-- customer-changelog/v1 {"releaseWorthy":false} -->

## Blast radius

What could break: <the surface this touches>
Proof: <the exact command or run that shows it still works>

<!--
A fix: PR also needs a `## Red-before-green` section: `Failing command: <exact command>` plus a fenced block with the real
red output from running it on the base without your change (or `Failing run (before fix): <run URL>`).
A UI change under apps/web/components or packages/ui needs the colocated *.stories.tsx.
Open the PR with `node scripts/pr-create.mjs` (same flags as `gh pr create`): it runs these rules locally and refuses with the text to add.
-->
