# CI/CD Pipeline Flow

This document explains the complete CI/CD pipeline flow from feature development to production deployment.

## 🔄 **Complete Flow Overview**

```
Feature Branch → main (production environment)
       ↓            ↓
    Fast CI    Full CI + Deploy
       ↓            ↓
   Auto Merge   Production (jov.ie)
```

**Trunk-Based Development:** Single long-lived branch (`main`) that deploys directly to production.

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

**Output:** Changes merged to `main` branch

---

### **Step 2: Production Deployment**

**Trigger:** Push to `main` branch (after PR merge)

**Process:**

1. ✅ **Full CI Suite:**
   - All fast checks (typecheck, lint)
   - Drizzle schema check
   - Build verification
   - Unit tests
   - E2E smoke tests

2. ✅ **Database Migrations:**
   - Run the DB safety preflight (environment + migration list)
   - Run `pnpm run drizzle:migrate:prod` against production database
   - Requires `ALLOW_PROD_MIGRATIONS=true` for safety

3. ✅ **Vercel Deployment:**
   - Deploy to jov.ie (production)
   - Run post-deployment verification
   - Verify key content loads

4. ✅ **Lighthouse CI:**
   - Performance budget verification
   - Accessibility checks
   - Best practices validation

**Output:** Changes live at [jov.ie](https://jov.ie)

---

## 🎯 **Key Features**

### **Trunk-Based Development:**

✅ **Feature PRs → main:**
- Lightning-fast CI (~10-15s for typecheck + lint)
- Auto-merge for safe changes (dependabot, codegen)
- **Ship multiple times per day**

✅ **Main → production:**
- Full CI suite with tests
- Database migrations with safety gates
- Automatic deployment after all checks pass
- **Typical deploy time: ~2 minutes**

### **Safety Gates:**

- ✅ **Feature PRs:** Typecheck + lint (fast feedback)
- ✅ **Production deploys:** Full CI + E2E tests before deployment
- ✅ **Database migrations:** Preflight checks + `ALLOW_PROD_MIGRATIONS` flag
- ✅ **Deployment verification:** Canary checks + Lighthouse CI

### **Database Strategy:**

- ✅ **Migrations:** Run automatically on `main` push via `drizzle:migrate:prod`
- ✅ **Preflight:** Environment and migration list validation before production migrations
- ✅ **Long-lived database:** Single `main` branch database (production)
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
3. **Direct production deploy:** Changes live on jov.ie within minutes

**Typical timeline:**
- Feature PR → main: **~15 seconds** (CI checks)
- Main → production: **~2 minutes** (full CI + deploy)
- **Total:** Ship to production in **< 3 minutes** from PR approval

---

## 🔧 **Workflow Configuration**

### **ci.yml Triggers:**

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

### **Fast vs Full CI:**

**Fast CI** (PRs to main):
- `ci-typecheck`
- `ci-lint`

**Full CI** (push to main):
- All fast checks
- `ci-drizzle-check`
- `ci-build`
- `ci-unit-tests`
- `ci-e2e-tests`
- `deploy-prod` (production deployment)

---

## 📊 **Migration Strategy**

### **Linear Append-Only:**

✅ **Always add new migrations** - never edit or squash existing ones
✅ **Run migrations automatically** - via CI deployment jobs on main push
✅ **Test migrations locally** - against ephemeral Neon branches

### **Migration Commands:**

```bash
# Create new migration
pnpm run drizzle:generate

# Apply migrations to production (auto-run by CI on main push)
pnpm run drizzle:migrate:prod

# Check schema drift
pnpm run drizzle:check:main
```

### **Production Migration Safety:**

- Requires `ALLOW_PROD_MIGRATIONS=true` environment variable
- Preflight check validates environment and migration list
- `GIT_BRANCH=main` signals production environment

---

## 🔄 **Rollback Procedure**

### **Immediate Rollback:**

1. **Revert PR merge:**
   ```bash
   git revert <commit-sha>
   git push origin main
   ```
   This triggers automatic deployment of the revert.

2. **Emergency hotfix:**
   - Create fix branch from `main`
   - PR directly to `main`
   - Fast CI checks + auto-merge if eligible
   - Deploy within 3 minutes

### **Database Rollback:**

⚠️ **Migrations are append-only** - cannot auto-rollback

**Options:**
1. Create reverse migration (preferred)
2. Manual database restore from backup (Neon snapshots)
3. Deploy code that handles both schema versions

---

## 📈 **Monitoring & Observability**

### **Deployment Verification:**

- ✅ Full test suite before deploy
- ✅ Lighthouse CI after deploy
- ✅ Key content verification
- ✅ Slack notifications (#alerts-production)

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

1. **Feature PRs:**
   - Fast approval for safe changes
   - Focus on business logic
   - Ensure tests cover new code

2. **Database changes:**
   - Verify migration safety
   - Ensure backward compatibility
   - Test against ephemeral branch
