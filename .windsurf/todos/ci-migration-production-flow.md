# CI Migration & Production Promotion Flow - CRITICAL PRIORITY

## Objective
Get the full CI/CD pipeline working end-to-end:
1. **main branch** → deploys to main.jov.ie with migrations auto-applied
2. **Auto-promotion** → creates PR from main → production after successful deploy
3. **production branch** → when PR merged, deploys to jov.ie with migrations auto-applied

**DO NOT STOP until this flow is verified working. Fix any issues that arise along the chain.**

---

## Current Architecture

### Branch Model
- `main` = staging environment (main.jov.ie, DATABASE_URL_MAIN)
- `production` = live environment (jov.ie, DATABASE_URL)

### CI Workflow (`.github/workflows/ci.yml`)
- **Push to main** triggers:
  1. `ci-fast-checks` (typecheck + lint)
  2. `ci-build`, `ci-unit-tests`, `ci-drizzle-check`
  3. `ci-e2e-tests` (runs migrations on ephemeral Neon branch)
  4. `deploy` job → runs `drizzle:migrate` on DATABASE_URL_MAIN, seeds, deploys to Vercel
  5. `promote` job → creates/updates PR main → production

- **Push to production** triggers:
  1. Same CI checks
  2. `deploy-prod` job → runs `drizzle:migrate:prod` on DATABASE_URL, deploys to Vercel prod

### Migration Scripts
- `scripts/drizzle-migrate.ts` - handles migrations with branch protection
- Requires `ALLOW_PROD_MIGRATIONS=true` for production/main branches
- Uses `GIT_BRANCH` env var to determine environment

---

## Verification Checklist

### Phase 1: Verify main branch CI passes
- [ ] Push a commit to main (or verify recent push)
- [ ] `ci-fast-checks` job passes (typecheck + lint)
- [ ] `ci-build` job passes
- [ ] `ci-unit-tests` job passes
- [ ] `ci-drizzle-check` job passes
- [ ] `ci-e2e-tests` job passes (migrations run on ephemeral branch)

### Phase 2: Verify deploy job succeeds
- [ ] `deploy` job starts after CI jobs pass
- [ ] `drizzle:migrate` runs successfully on DATABASE_URL_MAIN
- [ ] `db:seed` runs successfully
- [ ] Vercel build succeeds
- [ ] Vercel deploy succeeds
- [ ] Canary health check passes
- [ ] main.jov.ie is accessible and working

### Phase 3: Verify auto-promotion creates PR
- [ ] `promote` job runs after deploy succeeds
- [ ] PR main → production is created or updated
- [ ] PR has proper title: "🚀 Release: Promote main → production"
- [ ] PR has QA checklist in body

### Phase 4: Verify production deploy (after manual merge)
- [ ] Merge the promotion PR manually
- [ ] `deploy-prod` job triggers on push to production
- [ ] `drizzle:migrate:prod` runs successfully on DATABASE_URL
- [ ] Vercel production build succeeds
- [ ] Vercel production deploy succeeds
- [ ] jov.ie is accessible and working

---

## Common Issues & Fixes

### Issue: Migrations not in journal
**Symptom:** Migration .sql file exists but not applied
**Fix:** Ensure `drizzle/migrations/meta/_journal.json` has entry for each migration
```bash
pnpm run drizzle:generate  # Regenerates with proper journal entry
```

### Issue: DATABASE_URL not resolved
**Symptom:** "Missing required environment variable: DATABASE_URL"
**Fix:** Check GitHub secrets:
- `DATABASE_URL_MAIN` for main branch
- `DATABASE_URL` for production branch
- `NEON_DATABASE_URL` as fallback

### Issue: Migration blocked in CI
**Symptom:** "Production migrations blocked in CI"
**Fix:** Ensure `ALLOW_PROD_MIGRATIONS: 'true'` is set in CI workflow env

### Issue: Promote job fails to create PR
**Symptom:** No PR created after deploy
**Fix:** Check permissions in ci.yml:
```yaml
permissions:
  contents: write
  pull-requests: write
```

### Issue: Neon branch creation fails
**Symptom:** "Neon branch creation did not return db_url"
**Fix:** Check `NEON_API_KEY` and `NEON_PROJECT_ID` secrets/vars

---

## Guardrails (DO NOT VIOLATE)

1. **Never delete or modify existing migrations** - append-only
2. **Never bypass migration journal** - all migrations must be registered
3. **Never hardcode secrets** - use GitHub secrets/vars
4. **Never skip CI checks** - all must pass before deploy
5. **Never auto-merge to production** - requires manual approval
6. **Follow agents.md rules** - especially sections 1, 5, 6

---

## Recursive Execution Instructions

**For AI Agent:**

1. Start by checking current CI status on main:
   ```bash
   gh run list --branch main --limit 3 --json status,conclusion,name
   ```

2. If any job failed, investigate the failure:
   ```bash
   gh run view <run-id> --log-failed
   ```

3. Fix the root cause (not symptoms):
   - If migration issue → check journal, regenerate if needed
   - If secret issue → document which secret is missing
   - If code issue → fix the code, commit, push

4. After fix, verify CI passes:
   ```bash
   gh run watch  # Watch the new run
   ```

5. Once main CI green, verify promotion PR exists:
   ```bash
   gh pr list --base production --head main
   ```

6. If no PR, check promote job logs and fix

7. Once PR exists, notify user for manual merge

8. After merge, watch production deploy:
   ```bash
   gh run list --branch production --limit 1
   gh run watch <run-id>
   ```

9. **LOOP BACK TO STEP 1** if any step fails

---

## Success Criteria

The task is COMPLETE when:
1. ✅ main branch CI is fully green
2. ✅ main.jov.ie is deployed and accessible
3. ✅ Promotion PR (main → production) exists and is ready for review
4. ✅ After manual merge, production deploys successfully
5. ✅ jov.ie is deployed and accessible

**Do not mark complete until all 5 criteria are verified.**
