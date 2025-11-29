# Database Index Recommendations for Featured Creators Query

## Current Query Performance Issue

The featured creators API query uses a compound WHERE clause:

```sql
WHERE 
  creator_profiles.is_public = true AND
  creator_profiles.is_featured = true AND  
  creator_profiles.marketing_opt_out = false
```

Without proper indexes, this query will perform a full table scan for each condition.

## Recommended Indexes

### Primary Composite Index
```sql
-- Most efficient: covers all WHERE conditions
CREATE INDEX idx_creator_profiles_featured_query 
ON creator_profiles (is_public, is_featured, marketing_opt_out)
WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;
```

### Alternative: Include ORDER BY column
```sql
-- If display_name ordering is critical for performance
CREATE INDEX idx_creator_profiles_featured_with_name 
ON creator_profiles (is_public, is_featured, marketing_opt_out, display_name)
WHERE is_public = true AND is_featured = true AND marketing_opt_out = false;
```

## Implementation Note

These indexes should be created via Drizzle migration in the next database schema update. The partial WHERE clause in the index definition will make the index smaller and more efficient since it only indexes rows that match our query criteria.

When using Drizzle's SQL migrator, migrations are executed inside a transaction. PostgreSQL does not allow `CREATE INDEX CONCURRENTLY` inside a transaction block, so Drizzle migrations should use standard `CREATE INDEX IF NOT EXISTS ...` statements. If a truly concurrent index build is required for operational reasons, run the `CREATE INDEX CONCURRENTLY` statement manually (outside Drizzle) and keep the migration history append-only.

## Performance Impact

- **Before**: O(n) full table scan
- **After**: O(log n) index lookup + small result set scan
- **Expected improvement**: 10-100x faster query execution as table grows