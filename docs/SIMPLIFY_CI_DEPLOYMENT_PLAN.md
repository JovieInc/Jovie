# Simplify CI/CD: Deploy Directly from Main

## Overview

Migrate from a two-branch model (`main` → `production`) to trunk-based development where `main` deploys directly to production.

**Current state:**
- `main` → deploys to main.jov.ie (staging)
- `production` → deploys to jov.ie (production)
- Promotion PRs from main → production with manual approval
- Two Neon branches: `main` and `production`

**Target state:**
- `main` → deploys to jov.ie (production)
- Feature flags for staged rollouts
- Single Neon branch: `main` (production)
- Ephemeral Neon branches per PR for testing

---

## Phase 1: Vercel Configuration (Manual - You)

### 1.1 Update Production Branch

1. Go to **Vercel Dashboard** → Your Project → **Settings** → **Git**
2. Change **Production Branch** from `production` to `main`
3. This makes merges to `main` trigger production deployments

### 1.2 Update Domain Configuration

1. Go to **Settings** → **Domains**
2. Ensure `jov.ie` (production domain) is assigned to `main` branch
3. Either:
   - **Option A**: Remove `main.jov.ie` entirely (simplest)
   - **Option B**: Keep `main.jov.ie` as an alias pointing to the same deployment

### 1.3 Update Environment Variables

1. Go to **Settings** → **Environment Variables**
2. Any variables scoped to "Production" will now apply to `main`
3. Variables scoped to "Preview" will apply to PR deployments
4. Remove any `production`-specific overrides if they exist

### 1.4 Vercel Deployment Protection (Optional)

1. If you have **Deployment Protection** enabled for production:
   - Go to **Settings** → **Deployment Protection**
   - Ensure protection rules apply to `main` branch
   - Update any bypass secrets if needed

---

## Phase 2: Neon Database (Manual - You)

### 2.1 Consolidate to Single Branch

**Current Neon branches:**
- `production` - your production database
- `main` - staging database (may have different data)

**Decision point:** Which database becomes the single source of truth?

#### Option A: Use `production` branch, rename to `main` (Recommended)
```bash
# In Neon Console or via neonctl:
# 1. Delete the current `main` branch (staging data will be lost)
neonctl branches delete main --project-id $NEON_PROJECT_ID

# 2. Rename `production` to `main`
neonctl branches rename production main --project-id $NEON_PROJECT_ID
```

#### Option B: Keep as-is, just update references
- Keep using `production` Neon branch but deploy from git `main`
- Simpler but naming is confusing

### 2.2 Update Neon Project Settings

1. Go to **Neon Console** → Your Project → **Settings**
2. If there's a "Default branch" setting, set it to `main`
3. Ephemeral branches will still work (created per PR, deleted on close)

### 2.3 Update Environment Variables

In Vercel (or wherever you store secrets):
```
DATABASE_URL=<connection-string-for-main-branch>
DATABASE_URL_UNPOOLED=<unpooled-connection-string>
```

Ensure these point to the single `main` Neon branch.

---

## Phase 3: GitHub Workflows (Code Changes - Claude)

### 3.1 Files to Modify

| File | Changes |
|------|---------|
| `.github/workflows/ci.yml` | Remove `production` branch references, simplify triggers |
| `.github/workflows/auto-merge.yml` | Remove production promotion logic |
| `.github/workflows/synthetic-monitoring.yml` | Remove staging vs production matrix |
| `.github/workflows/neon-ephemeral-branch-cleanup.yml` | Remove `production` from protected list |
| `.github/workflows/canary-health-gate.yml` | Simplify to single URL |
| `agents.md` | Update branch model documentation |

### 3.2 CI Workflow Changes

**Before:**
```yaml
on:
  pull_request:
    branches: [main, production]
  push:
    branches: [main, production]
```

**After:**
```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

### 3.3 Auto-Merge Workflow Changes

- Remove all `production` branch handling
- Remove "promotion PR" logic (main → production)
- Keep auto-merge for dependabot, codegen, and labeled PRs

### 3.4 Synthetic Monitoring Changes

**Before:** Matrix with `[production, staging]`
**After:** Single job targeting `jov.ie`

### 3.5 Neon Cleanup Changes

**Before:** Protected branches `main,production`
**After:** Protected branch `main` only

---

## Phase 4: Documentation Updates (Code Changes - Claude)

### 4.1 Update agents.md

Remove references to:
- `production` branch
- Promotion PRs (main → production)
- Two-lane deployment model
- Fast lane / Gated lane distinction

Update to:
- Single `main` branch deploys to production
- Feature flags for staged rollouts
- Rollback via `git revert`

### 4.2 Update Workflow README

Update `.github/workflows/README.md` to reflect simplified model.

---

## Phase 5: Git Cleanup (Manual - You)

### 5.1 Delete Production Branch

**After all changes are deployed and verified:**

```bash
# Ensure main is up to date with production
git checkout main
git pull origin main
git fetch origin production
git merge origin/production  # Should be no-op if in sync

# Delete remote production branch
git push origin --delete production

# Delete local production branch (if exists)
git branch -D production
```

### 5.2 Update Branch Protection Rules

1. Go to **GitHub** → **Settings** → **Branches**
2. Delete branch protection rule for `production`
3. Keep/update protection for `main`:
   - Require status checks (ci-fast)
   - Require linear history (if desired)
   - Allow auto-merge

---

## Rollback Strategy (Post-Migration)

With single-branch deployment:

1. **Feature flag rollback**: Disable flag in Statsig
2. **Code rollback**: `git revert <commit> && git push origin main`
3. **Emergency**: Direct hotfix PR to main with expedited review
4. **Database rollback**: Neon point-in-time recovery

---

## Migration Checklist

### Pre-Migration
- [ ] Ensure `main` and `production` branches are in sync
- [ ] Verify all pending production PRs are merged or closed
- [ ] Communicate change to team

### Vercel (You)
- [ ] Change production branch to `main`
- [ ] Update domain assignments
- [ ] Verify environment variables

### Neon (You)
- [ ] Decide on branch consolidation strategy
- [ ] Execute branch rename/delete
- [ ] Update connection strings if needed

### GitHub Workflows (Claude)
- [ ] Update ci.yml
- [ ] Update auto-merge.yml
- [ ] Update synthetic-monitoring.yml
- [ ] Update neon-ephemeral-branch-cleanup.yml
- [ ] Update agents.md
- [ ] Update workflow README

### Post-Migration (You)
- [ ] Delete `production` branch from GitHub
- [ ] Delete `production` branch protection rules
- [ ] Verify deployment works (merge a test PR)
- [ ] Verify synthetic monitoring works
- [ ] Update any external documentation/runbooks

---

## Timeline

Since you're pre-launch, this can be done in a single session:

1. **Vercel changes**: 5-10 minutes
2. **Neon changes**: 5-10 minutes
3. **Workflow code changes**: Claude handles (this PR)
4. **Git cleanup**: 5 minutes
5. **Verification**: 10-15 minutes

**Total: ~45 minutes**
