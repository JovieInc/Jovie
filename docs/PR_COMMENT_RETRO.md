# PR Comment Hardening Retro

This repo includes a local, read-only retro script that summarizes repeated PR review feedback (humans + bots) so we can harden docs, templates, and tests over time.

## Run (dry run)

```bash
node scripts/pr-comment-retro.mjs --since-days 7 --limit 100 --dry-run
```

## Requirements

- `gh` CLI installed
- `gh` authenticated to GitHub:

```bash
gh auth login -h github.com
```

If authentication is missing/invalid, the script prints a **Blocked** section with the exact `gh auth status` output.

## Notes

- The script uses GitHub GraphQL to list recent PRs (some org/token setups return 404 for REST `/search/*` endpoints).
