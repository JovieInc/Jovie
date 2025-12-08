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
**IMPORTANT: Always use squash merge to prevent branch divergence!**
// turbo
```bash
# After manual review, merge the promotion PR with SQUASH
gh pr merge --squash --auto
```

> ⚠️ The production branch ruleset only allows squash merges. Using `--merge` or `--rebase` will be rejected.

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
This happens if someone merged a PR to production with `--merge` instead of `--squash`.

**To fix:**
```bash
# 1. Temporarily disable production ruleset
gh api repos/JovieInc/Jovie/rulesets/7143910 -X PUT -f enforcement="disabled"

# 2. Force-sync production to main
git fetch origin
git push origin origin/main:production --force

# 3. Re-enable production ruleset
gh api repos/JovieInc/Jovie/rulesets/7143910 -X PUT -f enforcement="active"
```

**Prevention:** The production ruleset now only allows squash merges (`allowed_merge_methods: ["squash"]`).
