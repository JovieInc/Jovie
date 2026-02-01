---
description: Audit hardcoded route paths that should use constants
tags: [audit, routes, quality]
---

# /audit-routes - Hardcoded Route Audit

Find hardcoded route paths that should use `APP_ROUTES` constants from `constants/routes.ts`.

## What This Checks

1. **Hardcoded dashboard routes** - `/app/dashboard/*` literals
2. **Hardcoded settings routes** - `/app/settings/*` literals
3. **Double-path bugs** - `getAppUrl('/app/dashboard')` when path is already `/dashboard`
4. **Admin routes** - `/app/admin/*` literals

## Run the Audit

```bash
echo "=== Checking for hardcoded /app/dashboard/ paths ==="
grep -rn "'/app/dashboard" apps/web --include="*.ts" --include="*.tsx" | grep -v "constants/routes" | grep -v ".test." | grep -v ".spec." || echo "✅ None found"

echo ""
echo "=== Checking for hardcoded /dashboard/ paths ==="
grep -rn "'/dashboard/" apps/web --include="*.ts" --include="*.tsx" | grep -v "constants/routes" | grep -v ".test." | grep -v ".spec." | grep -v "proxy.ts" || echo "✅ None found"

echo ""
echo "=== Checking for hardcoded /app/settings/ paths ==="
grep -rn "'/app/settings" apps/web --include="*.ts" --include="*.tsx" | grep -v "constants/routes" | grep -v ".test." | grep -v ".spec." || echo "✅ None found"

echo ""
echo "=== Checking for hardcoded /settings/ paths ==="
grep -rn "'/settings/" apps/web --include="*.ts" --include="*.tsx" | grep -v "constants/routes" | grep -v ".test." | grep -v ".spec." | grep -v "proxy.ts" || echo "✅ None found"

echo ""
echo "=== Checking for double-path getAppUrl bugs ==="
grep -rn "getAppUrl.*'/app/" apps/web --include="*.ts" --include="*.tsx" || echo "✅ None found"

echo ""
echo "=== Summary of constants/routes.ts ==="
head -50 apps/web/constants/routes.ts 2>/dev/null || echo "⚠️ constants/routes.ts not found"
```

## Expected Results

All checks should return "✅ None found" (except the summary). If violations are found:

### Replace hardcoded paths with constants

```typescript
// ❌ Wrong - hardcoded path
router.push('/app/dashboard/audience');
<Link href="/app/settings/billing">Billing</Link>

// ✅ Correct - use constants
import { APP_ROUTES } from '@/constants/routes';
router.push(APP_ROUTES.AUDIENCE);
<Link href={APP_ROUTES.BILLING}>Billing</Link>
```

### Fix double-path bugs

```typescript
// ❌ Wrong - getAppUrl already prepends domain, path includes /app/dashboard
const url = getAppUrl('/app/dashboard/audience');
// Results in: https://jov.ie/app/dashboard/audience (broken!)

// ✅ Correct - use clean route
const url = getAppUrl(APP_ROUTES.AUDIENCE);
// Results in: https://jov.ie/audience (correct!)
```

## Exclusions

The following are intentionally excluded from the audit:
- `constants/routes.ts` - This is where routes are defined
- Test files (`.test.ts`, `.spec.ts`) - Tests may use literal paths
- `proxy.ts` / `middleware.ts` - Route matching logic needs patterns

## When to Run

- Before creating PRs that add navigation or links
- When refactoring routing logic
- After adding new routes to ensure they're in constants
