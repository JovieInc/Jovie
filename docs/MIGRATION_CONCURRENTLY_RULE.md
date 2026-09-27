# Migration CONCURRENTLY Rule - Critical Reference

## TL;DR

**Never use `CREATE INDEX CONCURRENTLY` in Drizzle migration files.** Use the
certified online-index artifact path in `docs/DB_MIGRATIONS.md` when JOV-6273
workload evidence requires a nontransactional build.

- ❌ `CREATE INDEX CONCURRENTLY` → **BREAKS** migrations
- ✅ `CREATE INDEX IF NOT EXISTS` → valid only for the transactional path; it
  does not prove that a same-name index has the intended definition

## The Problem

This is a **recurring issue** that has broken our CI/CD pipeline multiple times. Here's why:

### PostgreSQL Rule
```sql
-- PostgreSQL allows CONCURRENTLY, but ONLY outside transactions:
CREATE INDEX CONCURRENTLY idx_name ON table_name (column);
```

### Drizzle Constraint
```typescript
// Drizzle ALWAYS wraps migrations in transactions:
await db.transaction(async (tx) => {
  // Run migration SQL here
  // CONCURRENTLY will fail because we're in a transaction!
});
```

### The Error
```
ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

This error:
- ❌ Breaks E2E tests
- ❌ Blocks CI/CD pipeline
- ❌ Prevents deployments
- ❌ Stops production promotions

## The Confusion

The confusion stems from conflicting advice:

### General PostgreSQL Best Practice (TRUE)
✅ For an **approved nontransactional** index build, `CONCURRENTLY` can avoid
blocking writes:
- Doesn't block writes during index build
- Still adds CPU/I/O load and transaction waits that must be measured
- Recommended by PostgreSQL docs

### Drizzle Migration Reality (OVERRIDES)
❌ For **Drizzle migrations**, `CONCURRENTLY` is **forbidden**:
- Drizzle wraps all migrations in transactions (required for atomicity)
- PostgreSQL forbids CONCURRENTLY inside transactions
- Will cause deployment failures 100% of the time

## The Solution

### ✅ Correct Syntax for Drizzle Migrations

```sql
-- CORRECT - Works in Drizzle transaction blocks
CREATE INDEX IF NOT EXISTS idx_name ON table_name (column_name);

-- Also correct for unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_name ON table_name (column_name);

-- Partial indexes (also fine)
CREATE INDEX IF NOT EXISTS idx_active
  ON table_name (column_name)
  WHERE is_active = true;
```

### ❌ Incorrect Syntax (Will Fail)

```sql
-- WRONG - Will break in Drizzle
CREATE INDEX CONCURRENTLY idx_name ON table_name (column_name);

-- WRONG - Even with IF NOT EXISTS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table_name (column_name);
```

## Production Safety

**"But won't indexes block production writes?"**

PostgreSQL's current contract is narrower than the historical blanket claim:
plain `CREATE INDEX` blocks writes but not reads. `CONCURRENTLY` permits writes,
does more work, waits for relevant transactions/snapshots, cannot run in a
transaction block, and may leave an invalid index after failure. Never infer
impact from migration counts or table names; recheck the current query plan,
table size, write rate, long transactions, and staging build time first.

## Safeguards in Place

### 1. Pre-commit Hook ✅
```bash
# Runs automatically on git commit
pnpm migration:validate
```

Detects CONCURRENTLY in migration files and **blocks the commit**.

### 2. CI Validation ✅
```yaml
# .github/workflows/ci.yml
- name: Validate Migrations
  run: |
    pnpm migration:validate
    pnpm exec tsx scripts/online-index-migrate.ts --validate-only
```

CI will **fail** if CONCURRENTLY is detected in a Drizzle migration or an
online-index artifact is not certifiable. The online path rejects unique
indexes because it is performance-only, not a correctness mechanism.

### 3. AGENTS.md Documentation ✅
Section 5.2 now has the **correct** guidance (previously had wrong info).

### 4. This Reference Doc ✅
Permanent reminder of the rule and why it exists.

## Historical Context

### Past Incidents
1. **Dec 6, 2024**: Migration 0004 used CONCURRENTLY → E2E tests failed
2. **Dec 7, 2024**: Attempted fix with migration 0008 → didn't work
3. **Dec 7, 2024**: Fixed by removing CONCURRENTLY from migration 0004
4. **Dec 7, 2024**: Updated AGENTS.md to prevent future occurrences

### Root Cause
- Initial `AGENTS.md` had **incorrect guidance** saying to use CONCURRENTLY
- AI agents followed the documentation faithfully
- Created a feedback loop of broken migrations

## Quick Reference Card

| Scenario | Use CONCURRENTLY? | Reason |
|----------|------------------|---------|
| Drizzle migration file | ❌ NO | Runs in transaction, will fail |
| Drizzle schema.ts file | ❌ NO | Generates migration SQL |
| Certified online-index artifact | ✅ WHEN APPROVED | Dedicated nontransactional runner verifies the result |
| Manual psql command | ⚠️ ONLY WITH APPROVAL | Outside transaction but bypasses the durable runner |
| Database GUI (pgAdmin) | ⚠️ ONLY WITH APPROVAL | Outside transaction but bypasses the durable runner |
| Neon SQL Editor | ⚠️ ONLY WITH APPROVAL | Outside transaction but bypasses the durable runner |

## When in Doubt

**Default to NO CONCURRENTLY in migration files.**

If you need CONCURRENTLY for a specific reason:
1. Stop and ask yourself: "Is this a Drizzle migration?"
2. If yes → DON'T use CONCURRENTLY
3. If JOV-6273 evidence approves it → add an append-only online-index artifact
4. Let the certified runner verify validity, definition, and durable checksum

## Related Files

- **Validation script**: `apps/web/scripts/validate-migrations.sh`
- **Online-index runner**: `apps/web/scripts/online-index-migrate.ts`
- **Agent guide**: `AGENTS.md` (Section 5.2)
- **Pre-commit config**: `package.json` (lint-staged)
- **CI workflow**: `.github/workflows/ci.yml`

## Summary

The rule is simple:

```
IF (creating_index_in_drizzle_migration) {
  USE "CREATE INDEX IF NOT EXISTS"
  NEVER USE "CONCURRENTLY"
}
```

This document exists because we keep making this mistake. Don't be the next one.
