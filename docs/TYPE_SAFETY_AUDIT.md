# Type Safety Audit Report

**Date:** 2025-12-29
**Scope:** Full codebase audit for `any` types and type escapes (excluding `.next/`)

## Executive Summary

This audit identifies unsafe type usage patterns that can lead to type safety erosion and runtime bugs. The codebase has **strict mode enabled** in TypeScript, but several escape hatches are being used.

### Key Findings

| Category | Production Code | Test Code | Total |
|----------|-----------------|-----------|-------|
| Explicit `: any` | 1 | 30+ | ~31 |
| `as any` assertions | 1 | 100+ | ~101 |
| `as unknown` assertions | 15 | 100+ | ~115 |
| `@ts-ignore` | 8 | 11 | 19 |
| `@ts-expect-error` | 9 | 6 | 15 |
| `[key: string]: any` | 0 | 1 | 1 |

---

## Critical Production Code Issues

### 1. High Priority (Potential Runtime Bugs)

#### `lib/env-server.ts:316`
```typescript
const p = process as any;
```
**Issue:** Accessing `process.platform` and `process.version` through `any` bypass.
**Fix:** Create a proper type for the process object with optional fields:
```typescript
interface ProcessWithVersion {
  platform?: string;
  version?: string;
}
const p = process as unknown as ProcessWithVersion;
```

#### `components/dashboard/organisms/links/hooks/useLinksManager.ts` (multiple locations)
Lines: 139, 202, 208, 219, 364, 369, 404, 408, 444

**Issue:** Heavy use of `as unknown as T` and `as unknown as { isVisible?: boolean }` patterns to work around type mismatches between `DetectedLink`, `LinkItem`, and generic `T`.
**Impact:** Type safety is completely bypassed; changes to these interfaces won't trigger compile-time errors.
**Fix:**
1. Create a proper base interface that both `DetectedLink` and `LinkItem` extend
2. Use discriminated unions or type guards instead of casting
3. Consider refactoring to use a single unified link type

#### `components/dashboard/organisms/links/utils/link-transformers.ts:245-253`
```typescript
const meta = link as unknown as { id?: string; state?: ... };
const rawVisibility = (link as unknown as { isVisible?: boolean }).isVisible;
```
**Issue:** Unsafe property access through double casting.
**Fix:** Add proper type guard or extend `DetectedLink` type to include these optional fields.

### 2. Medium Priority (Type Leakage)

#### `lib/ingestion/merge.ts:90`
```typescript
} as unknown as SocialLinkRow;
```
**Issue:** Object literal being cast to `SocialLinkRow` without proper type checking.
**Fix:** Ensure the object conforms to `SocialLinkRow` or use a factory function with proper typing.

#### `lib/stripe/webhooks/utils.ts:36`
```typescript
const object = event.data?.object as unknown as { id?: string } | null | undefined;
```
**Issue:** Stripe event object typing workaround.
**Fix:** Use Stripe's type utilities: `Stripe.InvoiceLineItem`, etc., or create proper type guards.

#### `lib/stripe/customer-sync.ts:109`
```typescript
const customer = existing as unknown as { id: string; metadata?: Record<string, string> | null };
```
**Issue:** Stripe customer typing workaround.
**Fix:** Import and use proper Stripe types: `Stripe.Customer` or `Stripe.DeletedCustomer`.

#### `lib/auth/session.ts:102`
```typescript
return await operation(db as unknown as DbType, userId);
```
**Issue:** Database mock compatibility casting.
**Fix:** Create a minimal interface for the DB operations needed, or use proper dependency injection for tests.

#### `lib/ingestion/magic-profile-avatar.ts:315-320`
```typescript
const sharpModule = (await import('sharp')) as unknown as SharpModule;
return sharpModule as unknown as SharpConstructor;
```
**Issue:** Dynamic import typing workaround.
**Fix:** Use proper type declaration for sharp module or declare module augmentation.

#### `lib/ingestion/strategies/youtube.ts:117-120`
```typescript
) as unknown) ?? ...
```
**Issue:** YouTube ingestion data extraction without proper typing.
**Fix:** Define proper types for YouTube page data structure.

### 3. Low Priority (Legacy/External API Workarounds)

#### `hooks/useLastAuthMethod.ts:47`
**Issue:** Clerk client type access workaround.
**Fix:** Add proper type declaration for Clerk internal API or use supported APIs.

#### `lib/utils/dev-cleanup.ts:23,44`
**Issue:** Process.once typing for dev cleanup.
**Fix:** Declare proper Node.js process extension interface.

#### `lib/db/index.ts:28`
```typescript
? (WebSocket as unknown as WebSocketConstructor)
```
**Issue:** WebSocket constructor typing for Neon.
**Fix:** Use proper type from `@neondatabase/serverless` types.

---

## @ts-ignore / @ts-expect-error Usage

### Production Code (Requires Attention)

| File | Line | Reason | Action |
|------|------|--------|--------|
| `app/api/images/upload/route.ts` | 393, 424, 475 | Drizzle version mismatch | Upgrade drizzle or add type shims |
| `app/api/images/status/[id]/route.ts` | 51-59 | Drizzle version mismatch | Upgrade drizzle or add type shims |
| `app/api/dashboard/profile/route.ts` | 54-352 | Drizzle dual-version type mismatch | Upgrade drizzle or add type shims |
| `hooks/useTouchDevice.ts` | 19 | IE/Edge `msMaxTouchPoints` | Acceptable - legacy browser API |
| `components/admin/table/atoms/TableCheckboxCell.tsx` | 61 | `indeterminate` not in types | Add type augmentation for HTMLInputElement |
| `components/providers/ErrorBoundary.tsx` | 71 | gtag not typed | Add gtag type declaration |

### Test Code (Lower Priority)
E2E and unit tests use `@ts-ignore` for Clerk authentication mocking - acceptable for test isolation.

---

## Test Code Type Safety

Test files make heavy use of `as any` for mocking. While this is common practice, consider:

1. **Creating typed mock factories** for frequently mocked objects (Clerk, Stripe, fetch)
2. **Using `vi.mocked()` with proper types** instead of `as any` casts
3. **Adding test-specific type declarations** in `tests/types/`

---

## Recommendations

### 1. Add Biome Rules (Immediate)

Add to `biome.json`:

```json
{
  "linter": {
    "rules": {
      "suspicious": {
        "noExplicitAny": "warn",
        "noConfusingVoidType": "warn"
      },
      "style": {
        "noNonNullAssertion": "warn"
      }
    }
  }
}
```

### 2. Incremental Cleanup Plan

**Phase 1 (High Impact):**
- [ ] Fix `useLinksManager.ts` type assertions - refactor to use proper generics
- [ ] Fix `link-transformers.ts` - extend `DetectedLink` interface
- [ ] Resolve Drizzle version mismatch affecting 3 API routes

**Phase 2 (Medium Impact):**
- [ ] Add type guards for Stripe webhook payloads
- [ ] Create proper types for ingestion strategies
- [ ] Fix `env-server.ts` process typing

**Phase 3 (Cleanup):**
- [ ] Add gtag type declaration
- [ ] Fix WebSocket constructor typing
- [ ] Create typed mock factories for tests

### 3. Add Pre-commit Hook

Create a script to warn on new `any` additions:

```bash
#!/bin/bash
# scripts/check-any-usage.sh
NEW_ANY=$(git diff --cached --name-only --diff-filter=ACMR | \
  grep -E '\.(ts|tsx)$' | \
  xargs grep -l ': any\|as any' 2>/dev/null)

if [ -n "$NEW_ANY" ]; then
  echo "⚠️  Warning: New 'any' usage detected in:"
  echo "$NEW_ANY"
  echo "Consider using proper types instead."
fi
```

### 4. Documentation

Add type safety guidelines to `agents.md`:

```markdown
## Type Safety Rules
- Prefer `unknown` over `any` when type is truly unknown
- Use type guards instead of type assertions
- Document any necessary `as unknown as T` with a comment explaining why
- Add `@ts-expect-error` only with a descriptive comment
```

---

## Files Requiring Priority Attention

1. **`apps/web/components/dashboard/organisms/links/hooks/useLinksManager.ts`** - 9 unsafe casts
2. **`apps/web/app/api/dashboard/profile/route.ts`** - 7 ts-expect-error comments
3. **`apps/web/app/api/images/upload/route.ts`** - 3 ts-ignore comments
4. **`apps/web/components/dashboard/organisms/links/utils/link-transformers.ts`** - 2 unsafe casts
5. **`apps/web/lib/stripe/customer-sync.ts`** - 1 unsafe cast (payment critical path)

---

## Conclusion

The codebase has **moderate type safety erosion**, primarily concentrated in:
1. Dashboard link management components (complex generic types)
2. Drizzle ORM version compatibility issues
3. Third-party SDK type workarounds (Stripe, Clerk)

Recommended approach: Enable Biome's `noExplicitAny` rule as **warn** initially, fix high-priority production code issues, then escalate to **error** once the backlog is cleared.
