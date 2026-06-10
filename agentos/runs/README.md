# runs/

Agent run output artifacts: screenshots, diffs, generated proposals, build outputs.

Run directories follow the naming convention: `<run-type>/<YYYY-MM-DD>/<run-id>/`

Examples:
- `design-review/2026-05-08/abc123/`
- `qa/2026-05-08/def456/`
- `visual-qa/<run_id>/<surface>/{baseline,after}-{dark,light}.png` (proposal-validation captures; see `apps/web/lib/visual-qa/registry.ts`)
- `visual-qa/<run_id>/breakpoint-report.json` (responsive breakpoint check summary)

Binary artifact files (images, zips, built assets) are gitignored via `agentos/runs/**/artifacts/`. Only run metadata files (JSON summaries, markdown reports) are committed.
