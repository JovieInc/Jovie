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

### 2.1 Current Neon Branch Model

```
┌─────────────────────────────────────────────────────────┐
│                    Neon Project                         │
├─────────────────────────────────────────────────────────┤
│  production (long-lived)  ←── git production deploys    │
│       │                                                 │
│       ├── main (long-lived) ←── git main deploys        │
│       │                                                 │
│       ├── feat-xyz-12345 (ephemeral) ←── PR #123        │
│       └── fix-abc-67890 (ephemeral) ←── PR #456         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Target Neon Branch Model

```
┌─────────────────────────────────────────────────────────┐
│                    Neon Project                         │
├─────────────────────────────────────────────────────────┤
│  main (long-lived, production) ←── git main deploys     │
│       │                                                 │
│       ├── feat-xyz-12345 (ephemeral) ←── PR #123        │
│       └── fix-abc-67890 (ephemeral) ←── PR #456         │
└─────────────────────────────────────────────────────────┘
```

**Single long-lived branch**: `main` = production database
**Ephemeral branches**: Created per PR for isolated testing, deleted on PR close

### 2.3 Migration Steps (Option A - Recommended)

```bash
# Set your project ID
export NEON_PROJECT_ID="your-project-id"

# Step 1: Verify current branches
neonctl branches list --project-id $NEON_PROJECT_ID

# Step 2: Delete the staging `main` branch (data will be lost)
# ⚠️  Make sure you don't need staging data!
neonctl branches delete main --project-id $NEON_PROJECT_ID

# Step 3: Rename `production` to `main`
neonctl branches rename production main --project-id $NEON_PROJECT_ID

# Step 4: Verify the rename
neonctl branches list --project-id $NEON_PROJECT_ID
# Should show: main (was production)

# Step 5: Update default branch (if needed)
neonctl projects update $NEON_PROJECT_ID --default-branch main
```

### 2.4 Update Connection Strings

After renaming, your connection strings change. Update in Vercel:

**Before** (two sets of secrets):
```
DATABASE_URL_MAIN=postgres://...@main-branch.neon.tech/neondb
DATABASE_URL=postgres://...@production-branch.neon.tech/neondb
```

**After** (single set):
```
DATABASE_URL=postgres://...@main-branch.neon.tech/neondb
DATABASE_URL_UNPOOLED=postgres://...@main-branch.neon.tech/neondb?sslmode=require
```

### 2.5 Ephemeral Branch Behavior (Unchanged)

Ephemeral branches continue to work the same way:

| Event | Neon Action |
|-------|-------------|
| PR opened | CI creates ephemeral branch from `main` |
| PR updated | Same ephemeral branch, migrations re-run |
| PR closed/merged | `neon-ephemeral-branch-cleanup.yml` deletes branch |

**Branch naming**: `{sanitized-branch-name}-{run-id}-{attempt}`
Example: `feat-add-auth-12345-1`

### 2.6 Protected Branches Update

Update the cleanup workflow to only protect `main`:

**Before**: `protected_branches: 'main,production,br-main,br-production'`
**After**: `protected_branches: 'main'`

### 2.7 GitHub Secrets to Update

| Secret | Action |
|--------|--------|
| `DATABASE_URL_MAIN` | Rename to `DATABASE_URL` or keep as alias |
| `DATABASE_URL` | Point to new `main` branch connection string |
| `DATABASE_URL_PROD` | Delete (no longer needed) |

In Vercel Environment Variables:
- **Production** scope: `DATABASE_URL` → main branch connection
- **Preview** scope: `DATABASE_URL` → main branch connection (ephemeral branches use CI-injected URLs)

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

## Phase 5: Branch Protection & CI Strategy (Critical)

This section defines what checks run when, and what's required to merge.

### 5.1 Current State (Two-Branch Model)

| Event | Branch | Required Checks | Full CI? |
|-------|--------|-----------------|----------|
| PR | → main | `ci-fast` (typecheck, lint, migration guard) | ❌ Fast only |
| PR | → production | Full CI (build, unit, E2E, Drizzle) | ✅ Yes |
| Merge Queue | main | `ci-fast` + smoke build | ❌ Fast only |
| Push | main | Full CI + deploy to main.jov.ie | ✅ Yes |
| Push | production | Full CI + deploy to jov.ie | ✅ Yes |

### 5.2 Target State (Single-Branch Model)

| Event | What Runs | Required for Merge? | Blocks Deploy? |
|-------|-----------|---------------------|----------------|
| PR → main | Fast checks (typecheck, lint, migration guard) | ✅ Yes | N/A |
| Merge Queue | Fast checks + smoke build | ✅ Yes | N/A |
| Push to main | Full CI (build, unit, E2E) + deploy | N/A | ✅ Yes |

**Key insight**: We keep PRs fast (~30s) but run full CI post-merge before deploy.

### 5.3 CI Job Dependency Graph (Simplified)

```
PR to main:
  ┌─────────────────┐
  │ ci-fast-checks  │ ← typecheck + lint (parallel)
  └────────┬────────┘
           │
  ┌────────▼────────┐
  │    ci-fast      │ ← aggregator (required check)
  └─────────────────┘

Merge Queue:
  ┌─────────────────┐
  │ ci-fast-checks  │
  └────────┬────────┘
           │
  ┌────────▼────────┐
  │ ci-merge-smoke  │ ← quick build validation
  └────────┬────────┘
           │
  ┌────────▼────────┐
  │    ci-fast      │
  └─────────────────┘

Push to main (post-merge):
  ┌─────────────────┐     ┌─────────────────┐
  │ ci-fast-checks  │     │    neon-db      │ ← ephemeral branch
  └────────┬────────┘     └────────┬────────┘
           │                       │
  ┌────────▼────────┐     ┌────────▼────────┐
  │    ci-build     │     │ ci-drizzle-check│
  └────────┬────────┘     └────────┬────────┘
           │                       │
  ┌────────▼──────────────────────▼┐
  │         ci-unit-tests          │
  └────────────────┬───────────────┘
                   │
  ┌────────────────▼───────────────┐
  │          ci-e2e-tests          │
  └────────────────┬───────────────┘
                   │
  ┌────────────────▼───────────────┐
  │            deploy              │ ← to jov.ie (production)
  └────────────────┬───────────────┘
                   │
  ┌────────────────▼───────────────┐
  │       canary-health-gate       │
  └────────────────────────────────┘
```

### 5.4 Branch Protection Rules (GitHub Rulesets)

**Delete**: `.github/rulesets/branch-protection-production.yml`

**Update**: `.github/rulesets/branch-protection.yml`

```yaml
name: 'Main Branch Protection'
enforcement: 'active'
target:
  ref_name:
    include:
      - 'refs/heads/main'
    exclude: []
rules:
  - type: 'pull_request'
    parameters:
      dismiss_stale_reviews_on_push: false
      require_code_owner_review: false
      required_approving_review_count: 0  # No approval required (pre-launch velocity)
      require_last_push_approval: false
  - type: 'required_status_checks'
    parameters:
      strict_required_status_checks_policy: true
      required_status_checks:
        - context: 'ci-fast'           # Aggregated fast checks
        - context: 'Migration Guard'   # Catches migration issues
  - type: 'merge_queue'
    parameters:
      check_response_timeout_minutes: 10
      grouping_strategy: 'ALLGREEN'
      max_entries_to_build: 5
      max_entries_to_merge: 5
      merge_method: 'SQUASH'
      min_entries_to_merge: 1
      min_entries_to_merge_wait_minutes: 1
bypass_actors: []
```

### 5.5 Merge Queue Configuration

Enable **GitHub Merge Queue** for main branch:

1. Go to **GitHub** → **Settings** → **Rules** → **Rulesets**
2. Edit the main branch ruleset
3. Enable **Require merge queue**
4. Configure:
   - **Merge method**: Squash
   - **Build concurrency**: 5
   - **Minimum to merge**: 1
   - **Wait time**: 1 minute

**Why merge queue?**
- Serializes merges to prevent broken main
- Runs smoke build before actual merge
- Auto-rebases if main advances while in queue

### 5.6 CI Behavior Summary

| Scenario | Fast Checks | Build | Unit Tests | E2E | Deploy |
|----------|-------------|-------|------------|-----|--------|
| PR opened | ✅ | ❌ | ❌ | ❌ | Preview only |
| PR with `testing` label | ✅ | ✅ | ✅ | ✅ | Preview |
| In merge queue | ✅ | Smoke | ❌ | ❌ | ❌ |
| Push to main | ✅ | ✅ | ✅ | ✅ | ✅ jov.ie |

### 5.7 Optional: Full CI on PRs

If you want more safety (at cost of slower PRs), you can require full CI:

```yaml
required_status_checks:
  - context: 'ci-fast'
  - context: 'Migration Guard'
  - context: 'Build'        # Add these for full CI
  - context: 'Unit Tests'   # on every PR
  - context: 'E2E Tests'
```

**Trade-off**: PRs take 5-10 min instead of 30s. Recommended post-launch.

---

## Phase 6: Git & GitHub Cleanup (Manual - You)

### 6.1 Delete Production Branch

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

### 6.2 Delete Production Branch Protection

1. Go to **GitHub** → **Settings** → **Rules** → **Rulesets**
2. Delete the `Production Branch Protection (full gate)` ruleset
3. Or via code: Delete `.github/rulesets/branch-protection-production.yml`

### 6.3 Update Main Branch Protection

Option A: Via GitHub UI
1. Go to **Settings** → **Rules** → **Rulesets**
2. Edit `Main Branch Protection`
3. Update required checks per section 5.4

Option B: Via code (Claude will do this)
- Update `.github/rulesets/branch-protection.yml`

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
- [ ] Ensure `main` and `production` git branches are in sync
- [ ] Verify all pending production PRs are merged or closed
- [ ] Note current Neon branch names and connection strings

### Phase 1: Vercel (You - ~10 min)
- [ ] **Settings → Git**: Change production branch from `production` to `main`
- [ ] **Settings → Domains**: Assign `jov.ie` to `main` branch deployments
- [ ] **Settings → Domains**: Remove or alias `main.jov.ie`
- [ ] **Settings → Environment Variables**: Consolidate to single `DATABASE_URL`
- [ ] **Settings → Deployment Protection**: Update if enabled

### Phase 2: Neon (You - ~10 min)
- [ ] List current branches: `neonctl branches list`
- [ ] Delete staging `main` branch: `neonctl branches delete main`
- [ ] Rename `production` to `main`: `neonctl branches rename production main`
- [ ] Update default branch: `neonctl projects update --default-branch main`
- [ ] Get new connection string for `main` branch
- [ ] Update `DATABASE_URL` in Vercel with new connection string
- [ ] Delete old `DATABASE_URL_MAIN` / `DATABASE_URL_PROD` secrets

### Phase 3-4: GitHub Workflows (Claude)
- [ ] Update `ci.yml` - remove production branch references
- [ ] Update `auto-merge.yml` - remove promotion PR logic
- [ ] Update `synthetic-monitoring.yml` - single target
- [ ] Update `neon-ephemeral-branch-cleanup.yml` - update protected branches
- [ ] Delete `.github/rulesets/branch-protection-production.yml`
- [ ] Update `.github/rulesets/branch-protection.yml`
- [ ] Update `agents.md` - new branch model documentation
- [ ] Update `.github/workflows/README.md`

### Phase 5: Branch Protection (You - ~5 min)
- [ ] **GitHub → Settings → Rules → Rulesets**
- [ ] Delete `Production Branch Protection (full gate)` ruleset
- [ ] Update `Main Branch Protection` with new required checks
- [ ] Enable merge queue if not already enabled
- [ ] Configure merge queue settings (squash, concurrency)

### Phase 6: Git Cleanup (You - ~5 min)
- [ ] Merge any final changes from `production` to `main`
- [ ] Delete remote: `git push origin --delete production`
- [ ] Delete local: `git branch -D production`

### Verification (You - ~15 min)
- [ ] Create test PR → verify fast checks run
- [ ] Merge test PR → verify full CI + deploy to jov.ie
- [ ] Check canary health gate passes
- [ ] Verify synthetic monitoring targets jov.ie only
- [ ] Test rollback: create revert PR, merge, verify deploy

---

## Timeline

Since you're pre-launch, this can be done in a single session:

| Phase | Owner | Time |
|-------|-------|------|
| 1. Vercel configuration | You | ~10 min |
| 2. Neon database migration | You | ~10 min |
| 3-4. Workflow code changes | Claude (this PR) | ~0 min (already done) |
| 5. Branch protection updates | You | ~5 min |
| 6. Git cleanup | You | ~5 min |
| 7. Verification | You | ~15 min |

**Total: ~45 minutes**

---

## Execution Order

1. **First**: Merge this PR (contains workflow changes)
2. **Then**: Do Vercel + Neon changes (Phase 1-2)
3. **Then**: Update branch protection (Phase 5)
4. **Finally**: Delete production branch and verify (Phase 6)

This order ensures CI is ready before you switch deployment targets.
