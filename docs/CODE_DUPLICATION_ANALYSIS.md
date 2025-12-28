# Code Duplication Analysis & Remediation Plan

**Date:** 2025-12-28
**Scope:** `apps/web/` directory
**Estimated Total Duplicate Lines:** 600-800 lines

---

## Executive Summary

This analysis identifies the worst code duplication offenders in the Jovie codebase and provides a prioritized remediation plan. The most impactful issues are:

1. **NO_STORE_HEADERS constant** - duplicated in 46 API route files
2. **normalizeEmail function** - identical implementation in 3 files
3. **Username validation logic** - duplicated between server and client with divergent reserved words lists
4. **Database query patterns** - repetitive select/from/where/limit(1) patterns

---

## Priority 1: Critical (High Impact, Easy Fix)

### 1.1 NO_STORE_HEADERS Constant

**Severity:** Critical
**Occurrences:** 46 files, 327 total references
**Duplicated Lines:** ~46 lines

**Current State:**
Every API route file defines:
```typescript
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
```

**Files Affected:**
- `apps/web/app/api/waitlist/route.ts`
- `apps/web/app/api/account/email/route.ts`
- `apps/web/app/api/admin/creator-avatar/route.ts`
- `apps/web/app/api/stripe/checkout/route.ts`
- ... and 42 more API route files

**Proposed Solution:**
Create `apps/web/lib/http/headers.ts`:
```typescript
/**
 * Common HTTP response headers for API routes
 */
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const CACHE_HEADERS = {
  noStore: NO_STORE_HEADERS,
  // Add other common header patterns as needed
} as const;
```

**Refactoring Steps:**
1. Create `apps/web/lib/http/headers.ts`
2. Find/replace all local `NO_STORE_HEADERS` definitions with import
3. Run tests to verify no regressions

**Effort:** ~1 hour

---

### 1.2 normalizeEmail Function

**Severity:** High
**Occurrences:** 3 files
**Duplicated Lines:** ~9 lines (3 lines × 3 files)

**Current State:**
Identical function defined in three locations:

| File | Line |
|------|------|
| `apps/web/lib/auth/clerk-identity.ts` | 21 |
| `apps/web/lib/waitlist/access.ts` | 13 |
| `apps/web/app/api/waitlist/route.ts` | 27 |

**Proposed Solution:**
Create `apps/web/lib/utils/email.ts`:
```typescript
/**
 * Normalize email addresses for consistent storage and comparison
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validate email format using RFC 5322 compliant regex
 */
export function isValidEmail(email: string): boolean {
  const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return EMAIL_REGEX.test(email);
}
```

**Effort:** ~30 minutes

---

## Priority 2: High (Significant Impact)

### 2.1 Username Validation Duplication

**Severity:** High
**Files Involved:** 2 files
**Duplicated Lines:** ~150 lines

**Current State:**

| File | Purpose | Lines | Reserved Words |
|------|---------|-------|----------------|
| `apps/web/lib/validation/username.ts` | Server-side | 256 | 131 words |
| `apps/web/lib/validation/client-username.ts` | Client-side | 165 | 27 words |

**Key Issues:**
1. **Duplicated constants:** `USERNAME_MIN_LENGTH`, `USERNAME_MAX_LENGTH`, `USERNAME_PATTERN`
2. **Divergent reserved words:** Server has 131 words, client has only 27
3. **Similar validation logic:** Nearly identical validation rules implemented twice
4. **Different error messages:** Server uses "Username", client uses "Handle"

**Proposed Solution:**
Create a shared validation core with environment-specific wrappers:

```
apps/web/lib/validation/
├── username-constants.ts    # Shared constants (works in both environments)
├── username-rules.ts        # Shared validation logic
├── username.ts              # Server-side exports (existing, imports from shared)
└── client-username.ts       # Client-side exports (existing, imports from shared)
```

**New `username-constants.ts`:**
```typescript
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-zA-Z0-9-]+$/;

// Complete reserved usernames list - single source of truth
export const RESERVED_USERNAMES = [
  // System routes
  'api', 'admin', 'dashboard', 'onboarding', 'settings', /* ... full list ... */
] as const;
```

**Effort:** ~2 hours

---

### 2.2 Email Validation Regex Inconsistency

**Severity:** Medium-High
**Occurrences:** 3+ variations

**Current State:**
Different email regex patterns in different files:

| File | Regex Pattern | Strictness |
|------|---------------|------------|
| `lib/notifications/validation.ts` | RFC 5322 compliant | Strict |
| `lib/contacts/validation.ts` | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | Lenient |
| Various components | Inline variations | Mixed |

**Proposed Solution:**
Consolidate in `apps/web/lib/utils/email.ts` (same file as normalizeEmail):
- Export both strict and lenient validators
- Document when to use each

**Effort:** ~1 hour

---

## Priority 3: Medium (Maintainability Improvement)

### 3.1 API Error Handling Patterns

**Severity:** Medium
**Occurrences:** 51 API route files, 183 try/catch blocks

**Current State:**
Repetitive pattern across all API routes:
```typescript
try {
  // request handling
} catch (error) {
  console.error('Failed to ...:', error);
  return NextResponse.json(
    { error: 'Unable to ...' },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}
```

**Proposed Solution:**
Create `apps/web/lib/http/api-utils.ts`:
```typescript
import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from './headers';

export function apiErrorResponse(
  message: string,
  status: number = 500,
  logError?: unknown
): NextResponse {
  if (logError) {
    console.error(message, logError);
  }
  return NextResponse.json(
    { error: message },
    { status, headers: NO_STORE_HEADERS }
  );
}

export function apiSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

// Higher-order function for route handlers
export function withApiErrorHandling<T>(
  handler: () => Promise<T>,
  errorMessage: string
): Promise<NextResponse> {
  return handler()
    .then(data => apiSuccessResponse(data))
    .catch(error => apiErrorResponse(errorMessage, 500, error));
}
```

**Effort:** ~3-4 hours (including refactoring existing routes)

---

### 3.2 Database Query Helpers

**Severity:** Medium
**Occurrences:** 16+ files with similar patterns

**Current State:**
Repetitive pattern:
```typescript
const [row] = await db.select().from(table).where(eq(column, value)).limit(1);
return row || null;
```

**Proposed Solution:**
Create `apps/web/lib/db/query-helpers.ts`:
```typescript
import { db } from './drizzle';
import { eq, SQL } from 'drizzle-orm';

export async function findOne<T>(
  table: any,
  where: SQL
): Promise<T | null> {
  const [row] = await db.select().from(table).where(where).limit(1);
  return (row as T) || null;
}

export async function findById<T>(
  table: any,
  idColumn: any,
  id: string
): Promise<T | null> {
  return findOne<T>(table, eq(idColumn, id));
}
```

**Effort:** ~2 hours

---

## Priority 4: Low (Nice to Have)

### 4.1 Runtime Configuration Duplication

**Occurrences:** 39 API routes define `export const runtime = 'nodejs';`

**Solution:** Use Next.js route segment config or route groups

**Effort:** ~1 hour

---

### 4.2 Hooks Directory Organization

**Current State:**
- `apps/web/lib/hooks/` - 7 hooks
- `apps/web/hooks/` - 12 hooks

**Solution:** Consolidate into single `apps/web/hooks/` directory

**Effort:** ~30 minutes

---

## Implementation Roadmap

### Phase 1: Quick Wins (Day 1)
- [ ] Create `lib/http/headers.ts` with NO_STORE_HEADERS
- [ ] Create `lib/utils/email.ts` with normalizeEmail
- [ ] Update imports across codebase

### Phase 2: Validation Consolidation (Day 2)
- [ ] Create `lib/validation/username-constants.ts`
- [ ] Refactor server and client username validation
- [ ] Sync reserved words list

### Phase 3: API Patterns (Day 3-4)
- [ ] Create `lib/http/api-utils.ts`
- [ ] Incrementally refactor API routes (prioritize most-used routes)

### Phase 4: Database Helpers (Day 5)
- [ ] Create `lib/db/query-helpers.ts`
- [ ] Refactor repetitive query patterns

### Phase 5: Cleanup (Day 6)
- [ ] Consolidate hooks directories
- [ ] Address runtime config duplication
- [ ] Final testing and documentation

---

## Impact Analysis

| Fix | Lines Removed | Files Affected | Risk Level |
|-----|---------------|----------------|------------|
| NO_STORE_HEADERS | ~45 | 46 | Low |
| normalizeEmail | ~6 | 3 | Low |
| Username validation | ~80 | 2 | Medium |
| API error handling | ~200 | 51 | Medium |
| DB query helpers | ~100 | 16 | Low |
| **Total** | **~431** | **118** | |

---

## Testing Strategy

1. **Before any changes:** Ensure all existing tests pass
2. **After each phase:** Run full test suite
3. **Manual verification:** Test critical flows (waitlist, auth, billing)
4. **Regression testing:** Verify API responses match expected format

---

## Files to Create

```
apps/web/lib/
├── http/
│   ├── headers.ts       # HTTP header constants
│   └── api-utils.ts     # API response helpers
├── utils/
│   └── email.ts         # Email normalization and validation
├── validation/
│   └── username-constants.ts  # Shared username validation constants
└── db/
    └── query-helpers.ts  # Database query utilities
```

---

## Conclusion

The codebase has accumulated technical debt through copy-paste patterns, particularly in API routes. The proposed changes will:

1. **Reduce maintenance burden** - Single source of truth for common patterns
2. **Improve consistency** - Standardized error responses and validation
3. **Decrease bug risk** - Divergent implementations (like reserved usernames) can't drift
4. **Improve DX** - Less boilerplate when adding new API routes

Total estimated effort: **2-3 days** for full implementation.
