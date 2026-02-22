# Testing Strategy for Continuous Deployment

This document outlines the testing strategy to enable safe, frequent deployments to production (multiple times per day) without regressions. Pair it with the actionable guardrails in [`docs/TESTING_GUIDELINES.md`](./TESTING_GUIDELINES.md) for when to choose each test type and how to review them well.

## Testing Pyramid

Following the pyramid approach defined in `AGENTS.md`:

```
        /\
       /E2E\        ← Critical paths only (~10 tests)
      /------\
     / Integ. \     ← API routes, DB interactions (~50 tests)
    /----------\
   /   Unit     \   ← Fast, pure logic (~500+ tests)
  /--------------\
```

### Unit Tests (Foundation)

**Target:** <200ms per test, majority of test suite

**What to test:**
- Pure functions (validators, transformers, utilities)
- Business logic without external dependencies
- Component rendering and interactions
- Error handling paths

**Mocking strategy:**
- Mock: Clerk, Stripe, Statsig, Database, External APIs
- Don't mock: Internal utilities, pure functions

**Example pattern:**
```typescript
import { describe, expect, it, vi } from 'vitest';

// Mock external dependencies
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() => ({ userId: 'test-user' })),
}));

describe('YourModule', () => {
  it('handles expected case', () => {
    expect(yourFunction(input)).toBe(expectedOutput);
  });

  it('handles error case gracefully', () => {
    expect(() => yourFunction(badInput)).toThrow(ExpectedError);
  });
});
```

### Integration Tests (Middle Layer)

**Target:** API routes with test database

**What to test:**
- API route handlers with database interactions
- RLS (Row Level Security) policies
- Data consistency and constraints

**Setup pattern:**
```typescript
import { beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '@/tests/setup-db';

beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});
```

### E2E Tests (Critical Paths)

**Target:** Golden path flows only

**Critical flows to test:**
1. Sign-up → Onboarding → Profile creation
2. Profile editing and publishing
3. Link management (add/edit/delete)
4. Payment flows (checkout, tipping)
5. Public profile viewing

## Ingestion Module Testing

The ingestion system has multiple strategies for extracting data from platforms:

### Tested Strategies
| Strategy | Test File | Coverage |
|----------|-----------|----------|
| Linktree | `tests/lib/ingestion/linktree.test.ts` | URL validation, extraction, fetch |
| Beacons | `tests/lib/ingestion/beacons.test.ts` | URL validation, extraction, fetch |
| Laylo | `tests/lib/ingestion/laylo.test.ts` | Handle extraction, URL validation |
| YouTube | `tests/lib/ingestion/youtube.test.ts` | Channel URL validation, data extraction |
| Base | `tests/lib/ingestion/base.test.ts` | Error handling, shared utilities |
| Jobs | `tests/lib/ingestion/jobs.test.ts` | Job scheduling, backoff logic |
| Processor | `tests/lib/ingestion/processor.test.ts` | Processing pipeline |

### Test Fixture Pattern

For HTML fixture files containing embedded JSON:
```html
<script id="dataId" type="application/json">
{
  "key": "value"
}
</script>
```

The `type="application/json"` attribute is required to prevent linter errors.

## CI/CD Integration

### Fast Checks (Every PR)
- `pnpm typecheck` - TypeScript compilation
- `pnpm lint` - Biome linting

### Full CI (Push to main / `testing` label)
- All fast checks
- `pnpm test` - Unit tests
- `pnpm test:e2e` - E2E smoke tests
- Drizzle migration validation
- Build verification

### Path Guards
CI jobs are optimized with path guards to skip unnecessary work:
- DB/schema changes → Run Drizzle checks
- Test changes → Run affected tests
- UI-only changes → Skip DB-related jobs

## Regression Prevention Strategies

### 1. Pre-commit Hooks
- TypeScript type checking
- Linting with auto-fix
- Migration validation
- Commit message format (Conventional Commits)

### 2. Protected Module Testing
High-risk areas require additional test coverage:
- `lib/auth/` - Authentication flows
- `lib/stripe/` - Payment processing
- `lib/db/` - Database operations
- `drizzle/migrations/` - Schema changes

### 3. Flaky Test Management
```bash
# Detect flaky tests
pnpm test:flaky

# Quarantine flaky tests
# Add to tests/quarantine.json
```

Quarantined tests run with retries but don't block CI.

### 4. Test Performance Guard
```bash
pnpm test:guard
```
Catches tests that exceed performance budgets.

## Adding Tests for New Features

### 1. Create test file following naming convention:
```
tests/lib/{module-name}/{feature}.test.ts
tests/unit/{component-name}.test.tsx
tests/integration/{flow-name}.test.ts
```

### 2. Use appropriate fixtures:
```
tests/lib/{module}/fixtures/{platform}/
```

### 3. Follow the describe/it pattern:
```typescript
describe('FeatureName', () => {
  describe('functionName', () => {
    it('handles expected input', () => {});
    it('handles edge case', () => {});
    it('handles error case gracefully', () => {});
  });
});
```

### 4. Run tests locally before pushing:
```bash
# Fast tests
pnpm test:fast

# Full tests
pnpm test

# Specific file
pnpm test -- path/to/test.ts
```

## Coverage Goals

| Area | Target | Current |
|------|--------|---------|
| Unit Tests | 80% | - |
| Integration | Critical paths | - |
| E2E | Golden paths | - |

## Continuous Improvement

1. **Monitor test run times** - Keep unit tests under 200ms each
2. **Review flaky tests weekly** - Fix or quarantine
3. **Add regression tests** - For every bug fix
4. **Maintain fixture files** - Keep them minimal and representative

## Commands Reference

```bash
# Run all unit tests
pnpm test

# Run fast tests (optimized config)
pnpm test:fast

# Run with coverage
pnpm test:ci

# Run E2E tests
pnpm test:e2e

# Run E2E in UI mode
pnpm test:e2e:ui

# Run smoke tests only
pnpm e2e:smoke

# Profile test performance
pnpm test:profile

# Detect flaky tests
pnpm test:flaky
```
