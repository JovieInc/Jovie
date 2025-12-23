# GitHub Workflow Organization

This document outlines the organization and purpose of all GitHub workflows in the Jovie repository.

## 🏗️ **Workflow Architecture**

### **Branch Strategy**

```
Feature Branch → main (production environment)
       ↓            ↓
    Fast CI    Full CI + Deploy
       ↓            ↓
   Auto Merge   Production (jov.ie)
```

**Trunk-Based Development:** Single long-lived branch (`main`) that deploys directly to production.

## Branch Structure

- **main**: Production branch
  - All feature branches merge here
  - Deploys to [jov.ie](https://jov.ie) automatically after full CI
  - **Fast CI required for PRs:** `ci-fast` (typecheck + lint ~10-15s)
  - **Full CI runs after merge:** build + tests + E2E + deploy
  - **Auto-merge enabled** for safe changes (dependabot, codegen)

## 📋 **Active Workflows**

### 1. **Main CI/CD Pipeline** (`ci.yml`)

**Purpose:** Unified CI/CD pipeline with fast-path optimization for rapid iteration

**Triggers:**

- Pull requests to `main`
- Push to `main`
- Manual dispatch

**Key Jobs:**

#### **Fast Path (PRs → main):**

- `ci-typecheck`: TypeScript type checking (~5-10s)
- `ci-lint`: ESLint with zero warnings (~5-10s)
- **Total CI time:** ~10-15 seconds

#### **Full CI (push to main):**

- `neon-db`: Create/reuse ephemeral Neon database branch
- `ci-drizzle-check`: Validate database schema changes
- `ci-build`: Build Next.js application
- `ci-unit-tests`: Run unit test suite
- `ci-e2e-tests`: End-to-end Playwright tests
- `deploy-prod`: Deploy to jov.ie with production migrations
- `lighthouse-ci-production`: Performance and accessibility validation

**Features:**

- ✅ **Path-based job skipping** - Only run relevant jobs based on file changes
- ✅ **Ephemeral Neon branches** - Auto-created per PR, auto-deleted on close
- ✅ **Production migrations** - Run automatically on main push with `ALLOW_PROD_MIGRATIONS=true`
- ✅ **Deployment verification** - Canary health checks + Lighthouse CI
- ✅ **Auto-merge support** - Safe changes merge automatically
- ✅ **Direct production deployment** - Main branch deploys to production

---

### 2. **Auto-Merge** (`auto-merge.yml`)

**Purpose:** Automated PR merging with safety checks for eligible changes

**Triggers:**

- `pull_request_target` events (synchronize, labeled, unlabeled, reopened)
- `pull_request_review` events (submitted, dismissed)
- `check_run` completion
- `workflow_run` completion
- Manual dispatch

**Logic:**

```typescript
// Auto-merge eligible if:
- Dependabot PR (patch/minor versions)
- Codegen PR (Supabase types, GraphQL codegen)
- PR with "automerge" label
- All required checks passing (ci-fast)
- No merge conflicts
```

**Safety Features:**

- ✅ Validates PR author (dependabot, github-actions, authorized users)
- ✅ Checks all required status checks pass
- ✅ Verifies no merge conflicts
- ✅ Ensures PR is not draft
- ✅ Confirms target branch allows auto-merge (main only)

---

### 3. **Neon Ephemeral Branch Cleanup** (`neon-ephemeral-branch-cleanup.yml`)

**Purpose:** Automatic cleanup of ephemeral Neon database branches

**Triggers:**

- PR closed events
- Manual dispatch

**Process:**

1. Sanitize branch name (same logic as creation)
2. Guard against deleting protected branch (`main`)
3. Delete ephemeral Neon branch via API
4. Verify deletion success

**Protected Branches:**

- ❌ `main` - Never deleted (production database)
- ✅ All other branches - Eligible for cleanup

---

### 4. **CodeQL Security Analysis** (`codeql.yml`)

**Purpose:** Automated security vulnerability scanning

**Triggers:**

- Push to `main`
- Weekly scheduled scan (Monday 13:36 UTC)

**Languages Analyzed:**

- JavaScript/TypeScript
- GitHub Actions workflows

**Features:**

- ✅ Automated security vulnerability detection
- ✅ Weekly scheduled scans for drift
- ✅ GitHub Security tab integration

---

### 5. **Dependabot Auto-Approve** (`dependabot-auto-approve.yml`)

**Purpose:** Auto-approve safe Dependabot updates to speed up auto-merge

**Triggers:**

- Dependabot pull requests

**Logic:**

- Auto-approves patch & minor updates
- Requires manual review for major version bumps
- Works with `auto-merge.yml` for full automation

---

## 🔄 **Workflow Dependencies**

### **Feature → Production Flow (Trunk-Based)**

```
Feature PR → main
├── ci-typecheck (parallel)
├── ci-lint (parallel)
└── Auto-merge (if eligible)
    └── Push to main triggers:
        ├── Full CI Suite
        │   ├── neon-db (ephemeral branch for testing)
        │   ├── ci-drizzle-check
        │   ├── ci-build
        │   ├── ci-unit-tests
        │   └── ci-e2e-tests
        └── deploy-prod
            ├── Run migrations (drizzle:migrate:prod with ALLOW_PROD_MIGRATIONS=true)
            ├── Deploy to jov.ie (production)
            ├── Lighthouse CI verification
            └── Slack notifications (#alerts-production)
```

---

## 🛡️ **Security & Compliance**

### **Security Workflows:**

- **CodeQL:** Weekly security vulnerability scanning
- **Dependabot:** Automated dependency updates with security checks
- **Auto-merge safety:** Validates PR author and checks before merging

### **Database Security:**

- **Ephemeral branches:** Isolated per-PR databases prevent cross-contamination
- **Protected branch:** `main` (production database) never deleted
- **Migration safety:** Append-only migrations, production flag required

### **Compliance Features:**

- ✅ Automated security scanning (CodeQL)
- ✅ Dependency vulnerability management (Dependabot)
- ✅ Migration guards (preflight checks + ALLOW_PROD_MIGRATIONS flag)
- ✅ PR size limits (< 400 LOC)
- ✅ Required status checks before merge

---

## 📊 **Monitoring & Metrics**

### **Performance Metrics:**

- Typecheck time: < 10s
- Lint time: < 10s
- Build time: < 2min
- E2E test time: < 5min
- **Total CI time:** < 10min (full suite)

### **Deployment Metrics:**

- Feature PR → CI checks: ~15 seconds
- Main push → production deploy: ~2 minutes
- **Total:** Ship to production in **< 3 minutes** from PR merge

### **Quality Metrics:**

- Zero warnings policy (ESLint)
- Full type safety (TypeScript strict mode)
- E2E coverage for critical paths
- Database schema validation

---

## 🚀 **Deployment Strategy**

### **Environment Promotion:**

1. **Feature branches:** Development and testing (ephemeral Neon DBs)
2. **Main:** Production environment ([jov.ie](https://jov.ie))

### **Deployment Triggers:**

- **Automatic:** Feature PR → main (auto-merge eligible)
- **Automatic:** Main push → deploy to jov.ie (production)

### **Database Strategy:**

- **Long-lived database:** `main` branch database (production)
- **Ephemeral branches:** Auto-created per PR, deleted on close
- **Migrations:** Linear append-only, auto-run on production deploy
- **Testing:** Each PR gets isolated database

### **Rollback Strategy:**

- **Code:** `git revert` + push to main (triggers automatic redeploy)
- **Database:** Create reverse migration (append-only)
- **Backups:** Neon point-in-time recovery available

---

## 🗑️ **Recently Removed Workflows & Infrastructure**

The following legacy workflows and infrastructure were removed during migration to trunk-based development:

### ❌ **Removed Workflows:**

1. `sync-preview-nightly.yml` - **DEPRECATED** (Preview branch no longer exists)
2. `sync-preview-on-prod-promotion.yml` - **DEPRECATED** (Preview DB resync no longer needed)
3. **Fast Lane system** - **REMOVED** (Automatic promotion from main → production)
4. **Production deployment job** - **REPLACED** (Now deploys from main, not production branch)

### ❌ **Removed Infrastructure:**

1. **Production branch** - **ELIMINATED** (Main branch IS production)
2. **Merge queue** - **REMOVED** (Infrastructure existed but never enabled)
3. **Branch protection ruleset for production** - **DELETED** (No production branch)
4. **Promotion PR automation** - **REMOVED** (No longer needed)

### **Removal Reasons:**

- **Simplified branching model:** Moved from main → production to pure trunk-based (main only)
- **Reduced complexity:** Single branch model eliminates promotion overhead
- **Faster iteration:** Direct deployment from main to production
- **Aligned with modern practices:** Trunk-based development is industry standard

---

## 📝 **Maintenance**

### **Regular Tasks:**

- Monitor workflow success rates via GitHub Actions dashboard
- Review Dependabot PRs for major version bumps
- Update security scan results from CodeQL
- Optimize build times (caching, parallel jobs)
- Clean up old ephemeral Neon branches (automated)

### **Troubleshooting:**

- **CI failures:** Check workflow logs in GitHub Actions
- **Migration issues:** Validate with `pnpm drizzle:check:main`
- **Deploy failures:** Review Lighthouse CI and Slack notifications
- **Auto-merge stuck:** Verify all required checks passing

---

## 🎯 **Best Practices**

### **Workflow Design:**

- ✅ Fast feedback loop (< 15s for typecheck + lint)
- ✅ Path-based job skipping (only run what's needed)
- ✅ Parallel job execution where possible
- ✅ Clear error messages and status updates

### **Performance:**

- ✅ Aggressive caching (Next.js cache, pnpm store, TypeScript build info)
- ✅ Minimal CI for feature PRs (fast path)
- ✅ Full CI only after merge to main
- ✅ Timeout management (prevent hanging jobs)

### **Security:**

- ✅ Minimal permissions (GITHUB_TOKEN with read-all by default)
- ✅ Secret management (DATABASE_URL, VERCEL_TOKEN, etc.)
- ✅ Automated vulnerability scanning (CodeQL, Dependabot)
- ✅ Protected branch rules (main)
- ✅ Production migration safety flag (ALLOW_PROD_MIGRATIONS)

---

## 🏁 **YC-Aligned Rapid Deployment**

This workflow organization enables **multiple deployments per day** through:

1. **Fast CI:** 10-15s for feature PRs
2. **Auto-merge:** Safe changes merge without waiting
3. **Direct production deploy:** Changes live on jov.ie within 3 minutes

**Total time:** Ship a feature to production in **< 3 minutes** from PR merge.

---

**Status:** ✅ **Optimized for Trunk-Based Rapid Deployment**

All workflows are organized for maximum velocity while maintaining production safety through automated testing, production migration gates, comprehensive monitoring, and direct deployment from main.
