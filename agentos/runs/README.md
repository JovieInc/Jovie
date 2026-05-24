# runs/

Agent run output artifacts: screenshots, diffs, generated proposals, build outputs.

Run directories follow the naming convention: `<run-type>/<YYYY-MM-DD>/<run-id>/`

Examples:
- `design-review/2026-05-08/abc123/`
- `qa/2026-05-08/def456/`

Binary artifact files (images, zips, built assets) are gitignored via `agentos/runs/**/artifacts/`. Only run metadata files (JSON summaries, markdown reports) are committed.
