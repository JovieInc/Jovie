# Neon MCP Integration

This document describes how to use the Neon Model Context Protocol (MCP) server with Jovie for advanced database operations.

## Overview

The Neon MCP server provides tools for:
- Comparing database schemas between branches
- Running SQL queries on specific branches
- Managing Neon projects and branches
- Generating zero-downtime migrations

## Setup

The Neon MCP server should be configured in your MCP settings (e.g., Windsurf, Claude Desktop).

## Available Tools

### `mcp2_compare_database_schema`

Compares the schema of a database between a child branch and its parent branch.

**Parameters:**
- `projectId` (required): The ID of your Neon project
- `branchId` (required): The ID of the child branch to compare
- `databaseName` (required): The name of the database (usually `neondb`)

**Example:**
```typescript
{
  projectId: "proud-waterfall-12345678",
  branchId: "br-preview-abc123",
  databaseName: "neondb"
}
```

**Output:**
Returns a unified diff showing the changes required to make the parent branch schema match the child branch schema.

## Workflow: Schema Comparison Before Production Deploy

### 1. Make Schema Changes

Edit your schema in `lib/db/schema.ts`:

```typescript
// Example: Adding a new column
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull(),
  // New column
  emailVerified: boolean('email_verified').default(false).notNull(),
});
```

### 2. Generate and Apply Migrations on Preview

```bash
# Generate migration
pnpm drizzle:generate

# Apply to preview branch
pnpm neon:migrate:preview
```

### 3. Compare Schemas Using MCP

Use the Neon MCP tool to compare preview with production:

```typescript
// Via Windsurf or Claude Desktop
mcp2_compare_database_schema({
  projectId: "your-project-id",
  branchId: "br-preview-xyz",
  databaseName: "neondb"
})
```

The tool will return a diff like:

```diff
--- a/neondb
+++ b/neondb
@@ -10,6 +10,7 @@
 CREATE TABLE public.users (
   id integer NOT NULL,
   clerk_user_id text NOT NULL,
   email text NOT NULL,
+  email_verified boolean DEFAULT false NOT NULL,
 );
```

### 4. Generate Zero-Downtime Migration

Based on the diff, the MCP tool can suggest zero-downtime migration steps:

```sql
-- Step 1: Add nullable column
ALTER TABLE users ADD COLUMN email_verified boolean;

-- Step 2: Set default for existing rows
UPDATE users SET email_verified = false WHERE email_verified IS NULL;

-- Step 3: Add NOT NULL constraint (non-blocking)
ALTER TABLE users ADD CONSTRAINT users_email_verified_not_null
  CHECK (email_verified IS NOT NULL) NOT VALID;

-- Step 4: Validate constraint
ALTER TABLE users VALIDATE CONSTRAINT users_email_verified_not_null;

-- Step 5: Set NOT NULL
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;

-- Step 6: Drop redundant constraint
ALTER TABLE users DROP CONSTRAINT users_email_verified_not_null;

-- Step 7: Set default for future inserts
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false;
```

### 5. Apply to Production

Once verified on preview:

```bash
# Merge to main
git checkout main
git merge preview

# Run production migration
GIT_BRANCH=production ALLOW_PROD_MIGRATIONS=true pnpm drizzle:migrate:prod
```

## Common Use Cases

### Case 1: Adding a Column with Default Value

**Schema Change:**
```typescript
createdAt: timestamp('created_at').defaultNow().notNull()
```

**Zero-Downtime Migration:**
```sql
-- Add nullable first
ALTER TABLE users ADD COLUMN created_at timestamptz;

-- Backfill existing rows
UPDATE users SET created_at = now() WHERE created_at IS NULL;

-- Add NOT NULL constraint
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT users_created_at_not_null;

-- Set default
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();
```

### Case 2: Adding an Index

**Schema Change:**
```typescript
// In schema.ts
export const usersEmailIdx = index('users_email_idx').on(users.email);
```

**Zero-Downtime Migration:**
```sql
-- Create index concurrently (doesn't block writes)
CREATE INDEX CONCURRENTLY users_email_idx ON users (email);
```

### Case 3: Adding a Foreign Key

**Schema Change:**
```typescript
userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
```

**Zero-Downtime Migration:**
```sql
-- Add FK without validation
ALTER TABLE posts ADD CONSTRAINT posts_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id)
  ON DELETE CASCADE NOT VALID;

-- Validate existing data (non-blocking)
ALTER TABLE posts VALIDATE CONSTRAINT posts_user_id_fk;
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Schema Diff Check

on:
  pull_request:
    branches: [main]
    paths:
      - 'lib/db/schema.ts'
      - 'drizzle/migrations/**'

jobs:
  schema-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # This would require Neon MCP CLI or API integration
      - name: Compare schemas
        run: |
          # Pseudo-code - actual implementation depends on Neon MCP CLI availability
          neon-mcp compare-schema \
            --project ${{ secrets.NEON_PROJECT_ID }} \
            --branch preview \
            --database neondb
```

## Best Practices

1. **Always compare before production**: Use MCP to preview changes
2. **Review generated SQL**: Don't blindly apply suggested migrations
3. **Test on preview first**: Verify migrations work on preview branch
4. **Use NOT VALID constraints**: For zero-downtime constraint additions
5. **Create indexes CONCURRENTLY**: Avoid blocking writes
6. **Document complex migrations**: Add comments explaining the approach

## Troubleshooting

### "Cannot find branch"

Ensure you're using the correct branch ID (starts with `br-`), not the branch name.

```bash
# Get branch ID from Neon Console or CLI
neon branches list --project-id your-project-id
```

### "Schema diff is empty"

This means the schemas are identical. Verify:
- Migrations were applied to the child branch
- You're comparing the correct branches
- The database name is correct

### "Permission denied"

Ensure your Neon API key has the necessary permissions:
- Read access to project
- Read access to branches
- Schema comparison permissions

## Related Documentation

- [Neon MCP Server](https://github.com/neondatabase/mcp-server-neon)
- [Neon Branching](https://neon.tech/docs/guides/branching)
- [Zero-Downtime Migrations](./neon-migrations.md#zero-downtime-migration-patterns)
