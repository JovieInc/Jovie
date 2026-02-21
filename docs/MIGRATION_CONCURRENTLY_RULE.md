# Migration CONCURRENTLY Rule - Critical Reference

## TL;DR

**NEVER use `CREATE INDEX CONCURRENTLY` in Drizzle migration files.**

- ❌ `CREATE INDEX CONCURRENTLY` → **BREAKS** migrations
- ✅ `CREATE INDEX IF NOT EXISTS` → **WORKS** correctly

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
✅ For **manual** index creation on live databases, `CONCURRENTLY` is better:
- Doesn't block writes during index build
- Production-safe for zero-downtime deployments
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

In practice, this is rarely an issue for our use case:

1. **Deployment timing**: Migrations run during deployment, before new traffic hits
2. **Index size**: Our tables are small-to-medium; indexes build in <1 second
3. **IF NOT EXISTS**: Makes re-running migrations safe (idempotent)
4. **Main staging**: We test on main.jov.ie before production

**For large tables (>10M rows):**
- Test index creation time on staging first
- Consider deploying during low-traffic windows
- Use partial indexes (`WHERE` clause) to reduce size
- Monitor database load during migration

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
  run: pnpm migration:validate
```

CI will **fail** if CONCURRENTLY is detected.

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
| Manual psql command | ✅ YES | Outside transaction, zero-downtime |
| Database GUI (pgAdmin) | ✅ YES | Outside transaction |
| Neon SQL Editor | ✅ YES | Outside transaction |

## When in Doubt

**Default to NO CONCURRENTLY in migration files.**

If you need CONCURRENTLY for a specific reason:
1. Stop and ask yourself: "Is this a Drizzle migration?"
2. If yes → DON'T use CONCURRENTLY
3. If you must → Create index manually outside migration system
4. Document why you're going off-script

## Related Files

- **Validation script**: `scripts/validate-migrations.sh`
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
