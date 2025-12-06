---
description: Run database migrations on the main/staging environment
tags: [database, migration, main]
---

# Migrate Main Database

Run Drizzle migrations on the **main/staging** environment database.

## Steps

1. **Verify Environment**
   - Confirm we're targeting the main/staging database
   - Check DATABASE_URL_MAIN is configured
   - Verify migrations exist in drizzle/migrations

2. **Run Migration**
   - Execute: `GIT_BRANCH=main DATABASE_URL=$DATABASE_URL_MAIN pnpm run drizzle:migrate`
   - Monitor output for errors
   - Verify migration completion

3. **Validation**
   - Check migration was successful
   - Verify no errors in output
   - Confirm all migrations applied

## Safety Checks

- This targets the **staging** environment (main branch)
- Safe to run without production-level precautions
- Rollback available via Neon branching if needed

## Environment Variables Required

- `DATABASE_URL_MAIN` - Main/staging database connection string
