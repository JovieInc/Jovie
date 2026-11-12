# Screenshot Fixtures

This directory contains tracked screenshot fixtures that are referenced by
current tests, docs, or review receipts.

## PR evidence belongs on the PR

Do not commit one-off PR evidence (before/after captures, QA stills, review
screenshots) here. Attach it to the PR, or upload it as a CI artifact. Committed
copies outlive the review and spend the repository's shrink-only byte budget.

The repo hygiene guard (`scripts/lib/orphan-screenshot-guard.mjs`, run on
pre-commit and in PR Size Guard) fails any image here or under
`docs/pen-stills/` that no tracked file outside the image's own folder
references by path or file name. A README in the image's own folder does not
count by itself; a bundle whose sibling README or manifest lists the image counts
only when something outside the folder names the folder (for example a surface
census evidence entry or a test that reads it). Policy:
[`docs/ci/repository-health.md`](../ci/repository-health.md).

Stale flyout-menu and chat file-upload demonstration screenshots were removed
after an import/doc reference sweep found no consumers outside this directory.

On 2026-11-11, 55 more orphaned review captures (6.12 MiB) were removed after
the same sweep found no reference to them outside this directory. The tracked
repo budget is shrink-only, so one-off PR evidence belongs on the PR itself,
not in the tree.
