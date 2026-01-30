# Database Index for Featured Creators Query

## Status: ✅ IMPLEMENTED

The featured creators query index has been implemented in migration `0018_featured_creator_query_index.sql`.

## Index Details

**Index Name:** `idx_creator_profiles_featured_query`

**Definition:**

```sql
CREATE INDEX "idx_creator_profiles_featured_query"
ON "creator_profiles"
USING btree ("is_public","is_featured","marketing_opt_out","display_name")
WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;
```

**Schema Location:** `lib/db/schema.ts` (creatorProfiles table definition)

**Migration:** `apps/web/drizzle/migrations/0018_featured_creator_query_index.sql`

## Query Being Optimized

The featured creators API query uses a compound WHERE clause:

```sql
SELECT id, username, display_name, avatar_url, creator_type
FROM creator_profiles
WHERE is_public = true
  AND is_featured = true
  AND marketing_opt_out = false
ORDER BY display_name
LIMIT 12
```

## Performance Impact

- **Before**: O(n) full table scan
- **After**: O(log n) index lookup + small result set scan
- **Expected improvement**: 10-100x faster query execution as table grows

The partial WHERE clause in the index definition makes the index smaller and more efficient since it only indexes rows that match our query criteria.

## Verification

To verify the index exists and is being used:

```bash
pnpm tsx scripts/verify-featured-creators-index.ts
```

This script will:

- Check if the index exists in the database
- Show index usage statistics
- Test query performance and verify the index is being used
- Provide recommendations if the index is missing or not being utilized

## Troubleshooting

If you're still experiencing full table scans:

1. **Verify migrations have been applied:**

   ```bash
   pnpm run drizzle:migrate
   ```

2. **Check if the index exists:**

   ```bash
   pnpm tsx scripts/verify-featured-creators-index.ts
   ```

3. **Update table statistics (if index exists but isn't being used):**

   ```sql
   ANALYZE creator_profiles;
   ```

4. **Check query execution plan:**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT id, username, display_name, avatar_url, creator_type
   FROM creator_profiles
   WHERE is_public = true AND is_featured = true AND marketing_opt_out = false
   ORDER BY display_name
   LIMIT 12;
   ```

## Migration Notes

When using Drizzle's SQL migrator, migrations are executed inside a transaction. PostgreSQL does not allow `CREATE INDEX CONCURRENTLY` inside a transaction block, so Drizzle migrations use standard `CREATE INDEX` statements. The migration was created via `pnpm run drizzle:generate` based on the schema definition.
