---
description: Audit database connections for non-standard patterns
tags: [audit, database, quality]
---

# /audit-db-connections - Database Connection Audit

Scan the codebase for non-standard database access patterns that violate our single driver policy.

## What This Checks

1. **db.transaction() usage** - Neon HTTP driver doesn't support transactions
2. **Manual pooling** - `pg`, `pg-pool` imports conflict with Neon's pooling
3. **Legacy client** - `@/lib/db/client` is deprecated
4. **Direct driver imports** - Should use `@/lib/db` abstraction

## Run the Audit

```bash
echo "=== Checking for db.transaction() usage ==="
grep -rn -E "\b(db|tx)\.transaction\(" apps/web/lib apps/web/app --include="*.ts" --include="*.tsx" || echo "✅ None found"

echo ""
echo "=== Checking for manual pooling imports ==="
grep -rn -E "from ['\"]pg['\"]|require\(['\"]pg['\"]\)" apps/web --include="*.ts" --include="*.tsx" || echo "✅ None found"
grep -rn -E "from ['\"]pg-pool['\"]|require\(['\"]pg-pool['\"]\)" apps/web --include="*.ts" --include="*.tsx" || echo "✅ None found"

echo ""
echo "=== Checking for new Pool() instantiation ==="
grep -rn "new Pool(" apps/web --include="*.ts" --include="*.tsx" || echo "✅ None found"

echo ""
echo "=== Checking for legacy client usage ==="
grep -rn "from ['\"]@/lib/db/client['\"]" apps/web --include="*.ts" --include="*.tsx" || echo "✅ None found"

echo ""
echo "=== Checking for direct @neondatabase imports outside lib/db ==="
grep -rn -E "from ['\"]@neondatabase|require\(['\"]@neondatabase" apps/web --include="*.ts" --include="*.tsx" | grep -v "lib/db/" || echo "✅ None found"
```

## Expected Results

All checks should return "✅ None found". If violations are found:

### For db.transaction()

Replace with sequential operations or batch inserts:

```typescript
// ❌ Wrong
await db.transaction(async (tx) => {
  await tx.insert(users).values(user);
  await tx.insert(profiles).values(profile);
});

// ✅ Correct - batch insert
await db.insert(users).values([user1, user2, user3]);

// ✅ Correct - sequential (if different tables)
await db.insert(users).values(user);
await db.insert(profiles).values(profile);
```

### For manual pooling

Replace with the canonical db import:

```typescript
// ❌ Wrong
import { Pool } from 'pg';
const pool = new Pool({ connectionString });

// ✅ Correct
import { db } from '@/lib/db';
```

### For legacy client

Update to use the main db export:

```typescript
// ❌ Wrong
import { db } from '@/lib/db/client';

// ✅ Correct
import { db } from '@/lib/db';
```

## When to Run

- Before creating PRs that touch database code
- During code reviews
- When onboarding new database-related features
