---
description: Generate a new Drizzle migration from schema changes
tags: [database, migration, schema, generate]
---

# Generate Database Migration

Generate a new Drizzle migration based on schema changes in the codebase.

## When to Use

Run this command when you've:
- Modified any files in `lib/db/schema/`
- Added new tables or columns
- Changed column types or constraints
- Updated indexes or relationships

## Steps

1. **Review Schema Changes**
   - Check git diff for schema file changes
   - Summarize what changed (new tables, altered columns, etc.)
   - Verify changes are intentional

2. **Generate Migration**
   - Run: `pnpm run drizzle:generate`
   - This creates new files in `drizzle/migrations/`
   - Drizzle compares current schema vs last migration

3. **Review Generated Migration**
   - Open the new migration SQL file
   - Verify it matches your intended changes
   - Check for:
     - Missing NOT NULL defaults
     - Potentially destructive operations
     - Index creation on large tables
     - Data migration needs

4. **Test Migration (Important!)**
   - Run migration on local/development database
   - Verify schema is correct
   - Test any data transformations
   - Check application still works

5. **Commit Migration**
   - Add migration files to git
   - Include descriptive commit message
   - Note what schema changes are included

## Safety Checks

Before generating:
- ✅ Ensure schema changes compile (run typecheck)
- ✅ Consider backwards compatibility
- ✅ Plan for zero-downtime if needed
- ✅ Have rollback strategy

## Output Files

New migration will create:
- `drizzle/migrations/[timestamp]_[name].sql` - SQL migration
- `drizzle/migrations/meta/_journal.json` - Updated migration journal
- `drizzle/migrations/meta/[timestamp]_snapshot.json` - Schema snapshot

## Next Steps

After generating:
1. Review and test the migration locally
2. Run `/check-migrations` to verify
3. Commit to version control
4. Deploy to staging with `/migrate-main`
5. Test on staging
6. Deploy to production with `/migrate-production` (with caution!)
