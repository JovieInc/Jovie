# Neon Database Migrations

This document describes how to manage database migrations on Neon, particularly for preview branches.

## Overview

Jovie uses Neon's branching feature to create isolated database environments for development, preview, and production. This allows safe testing of schema changes before they reach production.

## Branch Strategy

- **Production Branch**: Main database for live users (connected to `main` git branch)
- **Preview Branch**: Staging database for testing (connected to `preview` git branch)
- **Feature Branches**: Per-feature database branches (optional, for complex migrations)

## Environment Variables

Each environment should have its own `DATABASE_URL` pointing to the appropriate Neon branch:

```bash
# Production (main branch)
DATABASE_URL=postgresql://user:password@ep-main-xyz.region.aws.neon.tech/neondb

# Preview (preview branch)
DATABASE_URL=postgresql://user:password@ep-preview-xyz.region.aws.neon.tech/neondb

# Development (local or feature branch)
DATABASE_URL=postgresql://user:password@ep-dev-xyz.region.aws.neon.tech/neondb
```

## Migration Workflow

### 1. Generate Migrations

After making schema changes in `lib/db/schema.ts`:

```bash
pnpm drizzle:generate
```

This creates SQL migration files in `drizzle/migrations/`.

### 2. Run Migrations on Preview Branch

#### Option A: Using the Neon-specific script (Recommended)

```bash
# Run migrations on preview branch
pnpm neon:migrate:preview

# Run migrations and compare schemas
pnpm neon:migrate:preview:compare
```

#### Option B: Using the standard script with GIT_BRANCH

```bash
# Ensure DATABASE_URL points to preview branch
GIT_BRANCH=preview pnpm drizzle:migrate
```

### 3. Verify Migrations

After running migrations, verify the schema:

```bash
# Open Drizzle Studio to inspect the database
pnpm drizzle:studio

# Or use Neon's web console
# https://console.neon.tech
```

### 4. Compare Schemas (Using Neon MCP)

To compare the preview branch schema with the parent (production) branch:

1. Use the Neon MCP `mcp2_compare_database_schema` tool
2. Provide:
   - `projectId`: Your Neon project ID
   - `branchId`: The preview branch ID
   - `databaseName`: Usually `neondb`

The tool will return a diff showing schema differences.

### 5. Promote to Production

Once migrations are verified on preview:

```bash
# Merge preview to main
git checkout main
git merge preview

# Run migrations on production
GIT_BRANCH=production pnpm drizzle:migrate
```

**⚠️ Production Safety**: The production migration script requires explicit confirmation unless `ALLOW_PROD_MIGRATIONS=true` is set.

## Zero-Downtime Migration Patterns

For production migrations, follow these patterns to avoid downtime:

### Adding Columns with Defaults

```sql
-- ❌ Causes table rewrite
ALTER TABLE users ADD COLUMN created_at timestamptz DEFAULT now();

-- ✅ Zero-downtime approach
ALTER TABLE users ADD COLUMN created_at timestamptz;
UPDATE users SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_created_at_not_null;
```

### Adding Constraints

```sql
-- ✅ Add constraint without validation
ALTER TABLE users ADD CONSTRAINT users_age_positive
  CHECK (age > 0) NOT VALID;

-- ✅ Validate existing data (non-blocking)
ALTER TABLE users VALIDATE CONSTRAINT users_age_positive;
```

### Creating Indexes

```sql
-- ✅ Create index concurrently
CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
```

## Neon-Specific Features

### Database Branching

Create a new database branch for testing:

```bash
# Via Neon Console or CLI
neon branches create --name feat-new-schema --parent preview
```

Update your `.env.local` to point to the new branch:

```bash
DATABASE_URL=postgresql://user:password@ep-feat-new-schema-xyz.region.aws.neon.tech/neondb
```

### Schema Comparison

Use the Neon MCP to compare schemas between branches before merging:

```typescript
// Example: Compare preview branch with production
{
  projectId: "your-project-id",
  branchId: "preview-branch-id",
  databaseName: "neondb"
}
```

The diff output shows exactly what changes will be applied to production.

### Point-in-Time Restore

If a migration fails, use Neon's point-in-time restore:

1. Go to Neon Console
2. Select your branch
3. Choose "Restore" and select a timestamp before the migration
4. Create a new branch from that point

## Troubleshooting

### Migration Fails with Connection Error

- Verify `DATABASE_URL` is correct
- Check Neon project is active (not suspended)
- Ensure SSL is enabled in connection string

### Migrations Already Applied

If migrations were already run:

```bash
# Check migration history
pnpm drizzle:studio
# Navigate to __drizzle_migrations table
```

### Schema Drift Detected

If the database schema doesn't match your Drizzle schema:

```bash
# Generate a new migration to sync
pnpm drizzle:generate

# Review the generated SQL carefully
# Then apply it
pnpm neon:migrate:preview
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Migrate Preview Database

on:
  push:
    branches: [preview]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm neon:migrate:preview
        env:
          DATABASE_URL: ${{ secrets.PREVIEW_DATABASE_URL }}
```

## Best Practices

1. **Always test on preview first**: Never run migrations directly on production
2. **Review generated SQL**: Check migration files before applying
3. **Use zero-downtime patterns**: For production migrations, follow the patterns above
4. **Keep migrations small**: Prefer multiple small migrations over one large one
5. **Document breaking changes**: Add comments in migration files
6. **Monitor after deployment**: Watch for errors in Sentry/PostHog after migrations
7. **Have a rollback plan**: Know how to revert schema changes if needed

## Related Documentation

- [Neon Branching Guide](https://neon.tech/docs/guides/branching)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [Zero-Downtime Migrations](https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-need-this-lock-timeout-setting)
