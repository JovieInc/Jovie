# CI/CD Pipeline Flow

This document explains the complete CI/CD pipeline flow from feature development to production deployment.

## 🔄 **Complete Flow Overview**

```
main → production
 ↓         ↓
Fast CI   Full CI + Manual Review
 ↓         ↓
Auto Deploy  Auto Deploy (after approval)
main.jov.ie  jov.ie
```

## 📋 **Step-by-Step Flow**

### **Step 1: Feature Development → Main**

**Trigger:** PR to `main` branch from feature branch

**Process:**

1. ✅ **Fast CI Checks** (`ci-fast`):
   - TypeScript type checking (~5-10s)
   - ESLint (zero warnings policy) (~5-10s)
   - **Total:** ~10-15 seconds

2. ✅ **Path-Based Guards:**
   - Drizzle check only runs if DB changes detected
   - Build only runs if code changes detected
   - Tests only run if test/code changes detected

3. ✅ **Auto-Merge Eligible:**
   - Dependabot updates
   - Code generation (e.g., Supabase types)
   - PRs with `automerge` label

**Output:** Changes merged to `main` branch, deployed to [main.jov.ie](https://main.jov.ie)

---

### **Step 2: Main Branch Deployment**

**Trigger:** Push to `main` branch (after PR merge)

**Process:**

1. ✅ **Full CI Suite:**
   - All fast checks (typecheck, lint)
   - Drizzle schema check
   - Build verification
   - Unit tests
   - E2E smoke tests

2. ✅ **Database Migrations:**
   - Run `pnpm run drizzle:migrate` against main database
   - Seed data if needed

3. ✅ **Vercel Deployment:**
   - Deploy to main.jov.ie environment
   - Run canary health check
   - Verify key content loads

4. ✅ **Auto-Promotion:**
   - Automatically creates PR: `main → production`
   - Adds "needs-review" label
   - **Manual approval required**

**Output:**
- Main environment updated at [main.jov.ie](https://main.jov.ie)
- PR created for production promotion (requires review)

---

### **Step 3: Production Deployment**

**Trigger:** PR merge from `main → production` (manual approval)

**Process:**

1. ✅ **Production Deployment:**
   - Deploy to production environment (jov.ie)
   - Run database migrations on production
   - Post-deployment verification
   - Monitor for errors

**Output:** Changes live at [jov.ie](https://jov.ie)

---

## 🎯 **Key Features**

### **Fast-Path Development (YC-Optimized):**

✅ **Feature PRs → main:**
- Lightning-fast CI (~10-15s for typecheck + lint)
- Auto-merge for safe changes (dependabot, codegen)
- Instant deployment to main.jov.ie
- **Ship multiple times per day**

✅ **Main → production:**
- Full CI suite with tests
- Manual review for production safety
- Automatic deployment after approval

### **Safety Gates:**

- ✅ **Feature PRs:** Typecheck + lint (fast feedback)
- ✅ **Main deploys:** Full CI + E2E tests + manual review for production
- ✅ **Production:** Manual approval + automated verification

### **Database Strategy:**

- ✅ **Migrations:** Run automatically on deployment via `drizzle:migrate`
- ✅ **Long-lived branches:** Only `main` and `production` (no ephemeral preview)
- ✅ **PR branches:** Ephemeral Neon branches auto-created per PR
- ✅ **Cleanup:** Ephemeral branches deleted when PR closes

### **Error Handling:**

- ✅ **Path guards:** Skip unnecessary jobs when no relevant changes
- ✅ **Graceful fallbacks:** Use fallback secrets if primary unavailable
- ✅ **Conditional execution:** Only runs when needed
- ✅ **Comprehensive logging:** Clear status messages

### **Test Quarantine (Flaky Test Isolation):**

- ✅ **Single source of truth:** `tests/quarantine.json` lists quarantined unit + E2E specs.
- ✅ **Fast checks stay fast:** Quarantined tests never gate typecheck/lint.
- ✅ **Reliable signal:** Quarantined suites run separately with retries and report status without blocking merges.

**Process:**
1. Add test file paths to `tests/quarantine.json` under `unit` or `e2e`.
2. CI runs non-quarantined tests as the default lane.
3. Quarantined tests run in a separate step with retries, logging results for visibility.
4. Remove entries once a fix is verified and the test is stable.

---

## 🚀 **YC-Aligned Rapid Deployment**

This pipeline enables **multiple deployments per day** through:

1. **Fast feedback loop:** 10-15s CI for feature PRs
2. **Auto-merge:** Safe changes merge automatically
3. **Instant staging:** Changes live on main.jov.ie within minutes
4. **Manual production gate:** Quick review + auto-deploy

**Typical timeline:**
- Feature PR → main: **~2 minutes** (CI + merge + deploy)
- Main → production: **~5 minutes** (review + CI + deploy)
- **Total:** Ship to production in **< 10 minutes** from PR approval

---

## 🔧 **Workflow Configuration**

### **ci.yml Triggers:**

```yaml
on:
  pull_request:
    branches: [main, production]
  push:
    branches: [main, production]
  merge_group:
    branches: [main, production]
```

### **Fast vs Full CI:**

**Fast CI** (PRs to main):
- `ci-typecheck`
- `ci-lint`

**Full CI** (main → production):
- All fast checks
- `ci-drizzle-check`
- `ci-build`
- `ci-unit-tests`
- `ci-e2e-tests`

---

## 📊 **Migration Strategy**

### **Linear Append-Only:**

✅ **Always add new migrations** - never edit or squash existing ones
✅ **Run migrations automatically** - via CI deployment jobs
✅ **Test migrations locally** - against ephemeral Neon branches

### **Migration Commands:**

```bash
# Create new migration
pnpm run drizzle:generate

# Apply migrations (auto-run by CI)
pnpm run drizzle:migrate

# Check schema drift
pnpm run drizzle:check
```

---

## 🔄 **Rollback Procedure**

### **Immediate Rollback:**

1. **Revert PR merge:**
   ```bash
   git revert <commit-sha>
   git push origin main
   ```

2. **Emergency hotfix:**
   - Create fix branch from `production`
   - PR directly to `production` (bypass main)
   - Manual approval + deploy

### **Database Rollback:**

⚠️ **Migrations are append-only** - cannot auto-rollback

**Options:**
1. Create reverse migration (preferred)
2. Manual database restore from backup (Neon snapshots)
3. Deploy code that handles both schema versions

---

## 📈 **Monitoring & Observability**

### **Deployment Verification:**

- ✅ Canary health checks after every deploy
- ✅ HTTP 200 response verification
- ✅ Key content verification (homepage, dashboard)
- ✅ Error rate monitoring (via logs)

### **Performance Budgets:**

- ⏱️ Typecheck: < 10s
- ⏱️ Lint: < 10s
- ⏱️ Build: < 2min
- ⏱️ E2E tests: < 5min
- ⏱️ Total CI: < 10min

---

## 🎓 **Best Practices**

### **For Developers:**

1. **Keep PRs small:** < 400 LOC (enforced by CI)
2. **Use semantic commits:** `feat:`, `fix:`, `chore:`
3. **Run checks locally:** `pnpm typecheck && pnpm lint`
4. **Test migrations:** Create ephemeral Neon branch

### **For Reviews:**

1. **Main → production PRs:**
   - Verify all tests pass
   - Check migration safety
   - Review deployment plan
   - Confirm rollback strategy

2. **Feature PRs:**
   - Fast approval for safe changes
   - Focus on business logic
   - Ensure tests cover new code
