# GitHub Workflow Organization

This document outlines the organization and purpose of all GitHub workflows in the Jovie repository.

## 🏗️ **Workflow Architecture**

### **Branch Strategy**

```
main → production
 ↓         ↓
Fast CI   Full CI + Manual Review
 ↓         ↓
Auto Deploy  Auto Deploy (after approval)
main.jov.ie  jov.ie
```

## Branch Structure

- **main**: Default development branch
  - All feature branches merge here
  - Deploys to [main.jov.ie](https://main.jov.ie) automatically
  - Requires: `ci-fast` (typecheck + lint)
  - **Auto-merge enabled** for safe changes (dependabot, codegen)

- **production**: Live production environment
  - Only accepts PRs from `main`
  - Requires: Full CI (build + tests + E2E)
  - **Manual approval required** for merge
  - Deploys to [jov.ie](https://jov.ie) automatically

## 📋 **Active Workflows**

### 1. **Main CI/CD Pipeline** (`ci.yml`)

**Purpose:** Unified CI/CD pipeline with fast-path optimization for rapid iteration

**Triggers:**

- Pull requests to `main` or `production`
- Push to `main` or `production`
- Merge queue events
- Manual dispatch

**Key Jobs:**

#### **Fast Path (PRs → main):**

- `ci-typecheck`: TypeScript type checking (~5-10s)
- `ci-lint`: ESLint with zero warnings (~5-10s)
- **Total CI time:** ~10-15 seconds

#### **Full CI (main → production):**

- `neon-db`: Create/reuse ephemeral Neon database branch
- `ci-drizzle-check`: Validate database schema changes
- `ci-build`: Build Next.js application
- `ci-unit-tests`: Run unit test suite
- `ci-e2e-tests`: End-to-end Playwright tests
- `deploy`: Deploy to main.jov.ie with migrations
- `promote`: Auto-create production PR

**Features:**

- ✅ **Path-based job skipping** - Only run relevant jobs based on file changes
- ✅ **Ephemeral Neon branches** - Auto-created per PR, auto-deleted on close
- ✅ **Database migrations** - Run automatically on main deploys
- ✅ **Canary health checks** - Verify deployment success
- ✅ **Auto-merge support** - Safe changes merge automatically
- ✅ **Production promotion** - Auto-create PRs for production deployment

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
- All required checks passing
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
2. Guard against deleting protected branches (`main`, `production`)
3. Delete ephemeral Neon branch via API
4. Verify deletion success

**Protected Branches:**

- ❌ `production` - Never deleted
- ❌ `main` - Never deleted
- ✅ All other branches - Eligible for cleanup

---

### 4. **CodeQL Security Analysis** (`codeql.yml`)

**Purpose:** Automated security vulnerability scanning

**Triggers:**

- Push to `main` or `production`
- Pull requests to `main` or `production`
- Weekly scheduled scan (Monday 13:36 UTC)

**Languages Analyzed:**

- JavaScript/TypeScript
- GitHub Actions workflows

**Features:**

- ✅ Automated security vulnerability detection
- ✅ Weekly scheduled scans for drift
- ✅ Pull request security analysis
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

### 6. **CodeRabbit Autofix** (`coderabbit-autofix.yml`)

**Purpose:** Automatically fix PRs blocked by CodeRabbit review feedback

**Triggers:**

- `pull_request_review` with action `submitted`
- Only when reviewer is `coderabbitai[bot]`
- Only when review state is `changes_requested`
- Only when PR is not a draft
- Only when SHA has not exhausted retries (max 2)

**Process:**

1. **Guard Job**: Validates all trigger conditions
   - Verifies reviewer is CodeRabbit
   - Verifies review is blocking
   - Verifies PR is not draft
   - Checks retry guard (per-SHA, max 2 attempts)

2. **Autofix Job** (if guards pass):
   - Fetches review body and inline comments
   - Generates structured agent instructions
   - Runs Claude agent to apply fixes
   - Runs validation (Biome + TypeScript)
   - If validation fails: retry once with error context
   - If validation passes: commit and push
   - If retry fails: escalate to human

**Safety Features:**

- ✅ Per-SHA retry guard prevents infinite loops
- ✅ Maximum 2 attempts per commit SHA
- ✅ Least-privilege credentials
- ✅ Does not execute untrusted PR code
- ✅ Does not expose secrets to agent
- ✅ Clear escalation path (`needs-human` label)

**Agent Constraints:**

- Minimal diff - only change what's necessary
- Only modify files referenced by CodeRabbit
- No speculative refactoring
- No dead code introduction
- No lint error silencing via comments

**Escalation:**

When automation fails after 2 attempts:
- `needs-human` label added to PR
- Comment posted explaining failure
- Workflow stops cleanly

---

## 🔄 **Workflow Dependencies**

### **Feature → Main Flow**

```
Feature PR → main
├── ci-typecheck (parallel)
├── ci-lint (parallel)
└── Auto-merge (if eligible)
    └── Deploy to main.jov.ie
```

### **Main → Production Flow**

```
Push to main
├── Full CI Suite
│   ├── neon-db (ephemeral branch)
│   ├── ci-drizzle-check
│   ├── ci-build
│   ├── ci-unit-tests
│   └── ci-e2e-tests
├── deploy
│   ├── Run migrations (drizzle:migrate)
│   ├── Seed database
│   ├── Deploy to main.jov.ie
│   └── Canary health check
└── promote
    └── Create PR (main → production)
        └── Manual review required
```

### **Production Deployment**

```
PR merge (main → production)
└── CI runs (full suite)
    └── Deploy to jov.ie
        ├── Run migrations
        └── Post-deployment verification
```

---

## 🛡️ **Security & Compliance**

### **Security Workflows:**

- **CodeQL:** Weekly security vulnerability scanning
- **Dependabot:** Automated dependency updates with security checks
- **Auto-merge safety:** Validates PR author and checks before merging

### **Database Security:**

- **Ephemeral branches:** Isolated per-PR databases prevent cross-contamination
- **Protected branches:** `main` and `production` never deleted
- **Migration safety:** Append-only migrations, no destructive changes allowed

### **Compliance Features:**

- ✅ Automated security scanning (CodeQL)
- ✅ Dependency vulnerability management (Dependabot)
- ✅ Migration guards (check-migrations.sh)
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

- Feature PR → main deploy: ~2 minutes
- Main → production: ~5 minutes (with review)
- **Total:** Ship to production in < 10 minutes

### **Quality Metrics:**

- Zero warnings policy (ESLint)
- Full type safety (TypeScript strict mode)
- E2E coverage for critical paths
- Database schema validation

---

## 🚀 **Deployment Strategy**

### **Environment Promotion:**

1. **Feature branches:** Development and testing (ephemeral Neon DBs)
2. **Main:** Staging and validation ([main.jov.ie](https://main.jov.ie))
3. **Production:** Live application ([jov.ie](https://jov.ie))

### **Deployment Triggers:**

- **Automatic:** Feature PR → main (auto-merge eligible)
- **Automatic:** Main push → deploy to main.jov.ie
- **Manual:** Main → production (requires approval)
- **Automatic:** Production merge → deploy to jov.ie

### **Database Strategy:**

- **Long-lived branches:** `main`, `production` only
- **Ephemeral branches:** Auto-created per PR, deleted on close
- **Migrations:** Linear append-only, auto-run on deploy
- **Testing:** Each PR gets isolated database

### **Rollback Strategy:**

- **Code:** `git revert` + push to main
- **Database:** Create reverse migration (append-only)
- **Emergency:** Direct PR to production (bypass main)
- **Backups:** Neon point-in-time recovery available

---

## 🗑️ **Recently Removed Workflows**

The following legacy workflows were removed during CI/CD modernization:

### ❌ **Removed Workflows:**

1. `sync-preview-nightly.yml` - **DEPRECATED** (Preview branch no longer exists)
2. `sync-preview-on-prod-promotion.yml` - **DEPRECATED** (Preview DB resync no longer needed)

### **Removal Reasons:**

- **Deprecated branch model:** Moved from develop → preview → production to main → production
- **Reduced complexity:** Two-branch model simplifies workflow
- **Faster iteration:** Removed unnecessary staging environment

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
- **Migration issues:** Validate with `pnpm drizzle:check`
- **Deploy failures:** Review canary health check logs
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
- ✅ Full CI only for production-bound changes
- ✅ Timeout management (prevent hanging jobs)

### **Security:**

- ✅ Minimal permissions (GITHUB_TOKEN with read-all by default)
- ✅ Secret management (DATABASE_URL, VERCEL_TOKEN, etc.)
- ✅ Automated vulnerability scanning (CodeQL, Dependabot)
- ✅ Protected branch rules (main, production)

---

## 🏁 **YC-Aligned Rapid Deployment**

This workflow organization enables **multiple deployments per day** through:

1. **Fast CI:** 10-15s for feature PRs
2. **Auto-merge:** Safe changes merge without waiting
3. **Instant staging:** Changes live on main.jov.ie within 2 minutes
4. **Quick production:** Manual review + auto-deploy in ~5 minutes

**Total time:** Ship a feature to production in **< 10 minutes** from PR creation.

---

**Status:** ✅ **Optimized for YC-Style Rapid Iteration**

All workflows are organized for maximum velocity while maintaining production safety through automated testing, manual production gates, and comprehensive monitoring.
