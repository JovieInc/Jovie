---
description: Run database migrations on PRODUCTION (requires confirmation)
tags: [database, migration, production, critical]
---

# Migrate Production Database

⚠️ **CRITICAL OPERATION** ⚠️

Run Drizzle migrations on the **PRODUCTION** database. This affects live users.

## Pre-Migration Checklist

Before proceeding, YOU MUST verify:

1. **Backup Verification**
   - Check recent backup exists via Neon console
   - Verify backup is recent (< 24 hours old)
   - Confirm backup restoration process is documented

2. **Migration Review**
   - List all pending migrations
   - Review migration SQL files in drizzle/migrations/
   - Ensure no destructive operations (DROP, TRUNCATE without guards)
   - Verify migration has been tested on staging (main branch)

3. **Team Notification**
   - Alert team before running production migration
   - Have rollback plan ready
   - Ensure monitoring is active

## Execution

Only after ALL checklist items are verified:

```bash
GIT_BRANCH=production DATABASE_URL=$DATABASE_URL ALLOW_PROD_MIGRATIONS=true pnpm run drizzle:migrate:prod
```

## Interactive Mode

For local/manual runs, the script will prompt:
- Type "MIGRATE PRODUCTION" to confirm

## Rollback Plan

If migration fails:
1. Check error logs immediately
2. If data corruption: Restore from Neon backup
3. If schema issue: Create rollback migration
4. Notify team and document incident

## Environment Variables Required

- `DATABASE_URL` - Production database connection string
- `ALLOW_PROD_MIGRATIONS=true` - Safety flag (required in CI)

## Safety Features

- Requires explicit confirmation
- Protected by ALLOW_PROD_MIGRATIONS flag
- Branch verification (must be on production branch)
- Connection validation before execution
