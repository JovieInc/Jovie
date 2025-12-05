---
description: Check pending migrations and database status
tags: [database, migration, status]
---

# Check Migration Status

Review pending migrations and database migration state.

## Tasks

1. **List Generated Migrations**
   - Check drizzle/migrations/ directory
   - Read meta/_journal.json for migration list
   - Show migration files and their order

2. **Check Applied Migrations** (if database accessible)
   - Query __drizzle_migrations table
   - Compare with generated migrations
   - Identify pending migrations

3. **Migration File Review**
   - List all .sql files in drizzle/migrations/
   - Show timestamps and names
   - Highlight any concerning operations (DROP, ALTER with data loss)

## Output

Provide a clear summary:
- Total migrations generated: X
- Applied migrations: Y (if accessible)
- Pending migrations: Z
- Latest migration: [name and timestamp]

## Safety

This is a READ-ONLY operation - no changes will be made to the database.
