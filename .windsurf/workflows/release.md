---
description: Promote code to production release
---

# Release Workflow: main → production

This workflow ensures code flows from `main` to `production` with migrations auto-applied.

## Prerequisites
- All changes must be on `main` branch first
- CI must pass on `main` (typecheck, lint, build, unit tests, E2E)
- Migrations must be registered in `drizzle/migrations/meta/_journal.json`

## Steps

### 1. Verify main branch is green
```bash
# Check latest CI status on main
gh run list --branch main --limit 5
```

### 2. Verify migrations are properly registered
```bash
# Check that all .sql files have journal entries
pnpm run drizzle:check
```

### 3. Push to main triggers auto-promotion
When CI passes on `main`:
1. `deploy` job runs migrations on `DATABASE_URL_MAIN` (main.jov.ie staging)
2. `promote` job creates/updates PR: main → production
3. PR requires manual approval before merge

### 4. Merge production PR
**IMPORTANT: Prefer a merge commit (not squash) to keep `production` aligned with `main`.**
// turbo
```bash
# After manual review, merge the promotion PR
gh pr merge --merge
```

> ⚠️ If the production branch ruleset only allows squash merges, `production` will diverge from `main`.
> In that case, immediately follow up with a PR to merge `production` back into `main` after the release.

### 5. Production deploy runs automatically
When PR merges to `production`:
1. `deploy-prod` job runs `drizzle:migrate:prod` on `DATABASE_URL`
2. Vercel production build and deploy to jov.ie

## Troubleshooting

### Migration fails in CI
1. Check `drizzle/migrations/meta/_journal.json` has all migrations
2. Verify migration SQL syntax is valid PostgreSQL
3. Check `DATABASE_URL_MAIN` / `DATABASE_URL` secrets are set

### Promotion PR not created
1. Check `promote` job in CI workflow
2. Verify `GITHUB_TOKEN` has `pull-requests: write` permission
3. Manually trigger via: `gh workflow run auto-promote.yml`

### Production migration blocked
1. Ensure `ALLOW_PROD_MIGRATIONS=true` is set in CI
2. Check `GIT_BRANCH=production` is passed to migration script

### Production branch diverged from main
This happens when `production` receives commits that are not in `main` (for example, squash-merged release PRs).

**To fix:**

Do not bypass branch protections or force-push.

If `production` diverges, stop and resolve via a normal PR-based workflow (or manual maintainer intervention), ensuring history and migrations remain consistent.

**Prevention:** Keep `production` as a fast-forward of `main` by using merge commits for release PRs.
