# Test Optimization Quick Reference

## TL;DR - What Changed?

**Old way:** All tests loaded everything (CSS, mocks, database) upfront
**New way:** Tests only load what they need

## Quick Decision Tree

```
Is this a NEW test?
├─ Yes → Follow patterns below
└─ No → See Migration Guide

What does your test need?
├─ Nothing (pure function/component) → Pattern A
├─ External APIs/hooks → Pattern B
├─ Database → Pattern C
└─ Everything → Pattern D (rare)
```

## Pattern A: Pure Unit Test (90% of tests)

**Use when:** Testing pure components or functions with no external dependencies

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

**Performance:** <100ms ✅

## Pattern B: Component with Mocks (8% of tests)

**Use when:** Component uses external APIs, hooks, or services

```typescript
import { render } from '@testing-library/react';
import { describe, it, vi } from 'vitest';

// Define mocks BEFORE importing component
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('tracks event', () => {
    render(<MyComponent />);
    // test implementation
  });
});
```

**Performance:** <200ms ✅

## Pattern C: Integration Test (2% of tests)

**Use when:** Testing database operations or server actions

```typescript
import { describe, it, expect } from 'vitest';
import { setupDatabaseBeforeAll } from '../setup-db';

// Setup database ONCE per file
setupDatabaseBeforeAll();

import { myDatabaseFunction } from '@/lib/db';

describe('Database Integration', () => {
  it('queries correctly', async () => {
    const result = await myDatabaseFunction();
    expect(result).toBeDefined();
  });
});
```

**Performance:** <2000ms ✅

## Pattern D: Complex Component (<1% of tests)

**Use when:** Component needs many global mocks (try to avoid this)

```typescript
import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import { setupComponentMocks } from '../setup-mocks';

// Load global mocks
setupComponentMocks();

import { MyComplexComponent } from '@/components/MyComplexComponent';

describe('MyComplexComponent', () => {
  it('renders with all dependencies', () => {
    render(<MyComplexComponent />);
    // test implementation
  });
});
```

**Performance:** <500ms ⚠️ (consider refactoring)

## Common Mocks Cheat Sheet

### Analytics
```typescript
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));
```

### Next.js Router
```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
```

### Clerk Auth
```typescript
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null, isLoaded: true }),
}));
```

### Fetch API
```typescript
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ data: 'mock' }),
  })
) as any;
```

## Performance Checklist

- [ ] Test runs in <200ms (unit) or <2s (integration)
- [ ] No unnecessary imports
- [ ] Mocks defined before component import
- [ ] Database setup only in integration tests
- [ ] No global CSS import

## Red Flags 🚩

❌ `import '../app/globals.css'` in test files
❌ `setupDatabase()` in component tests
❌ `setupComponentMocks()` when you can use inline mocks
❌ Tests taking >200ms that don't touch database
❌ Importing entire modules when you need one function

## Green Flags ✅

✅ Inline mocks using `vi.mock()`
✅ `setupDatabaseBeforeAll()` only in integration tests
✅ Fast tests (<200ms for unit, <2s for integration)
✅ Clear, focused test files
✅ Minimal imports

## Migration Checklist

Migrating an existing slow test?

1. [ ] Identify dependencies (database? mocks? CSS?)
2. [ ] Choose pattern (A, B, C, or D)
3. [ ] Remove unnecessary imports
4. [ ] Add only required setup
5. [ ] Run test and verify <200ms
6. [ ] Commit with performance improvement in message

## Files to Know

- `tests/setup.ts` - Core setup (auto-loaded, minimal)
- `tests/setup-db.ts` - Database setup (lazy-loaded)
- `tests/setup-mocks.ts` - Global mocks (lazy-loaded)
- `tests/setup-browser.ts` - Browser globals (auto-loaded)

## Help & Examples

- **Full guide:** `tests/TEST_OPTIMIZATION_GUIDE.md`
- **Examples:** `tests/unit/*.optimized.test.tsx`
- **Benchmark:** `scripts/benchmark-test-performance.sh`
- **Analyze:** `scripts/analyze-test-dependencies.sh`

## Quick Commands

```bash
# Run specific test
pnpm test -- path/to/test.tsx

# Run with timing info
pnpm test -- --reporter=verbose

# Benchmark performance
./scripts/benchmark-test-performance.sh

# Analyze dependencies
./scripts/analyze-test-dependencies.sh
```

## When in Doubt

1. Start with Pattern A (pure test)
2. Add mocks inline as needed (Pattern B)
3. Only use global setup if truly needed
4. Check .optimized.test examples
5. Ask: "Does this really need database/mocks/CSS?"

## Remember

**Fast tests = Happy developers**

Keep tests:
- **Focused:** One thing per test
- **Isolated:** No shared state
- **Fast:** <200ms for unit, <2s for integration
- **Clear:** Easy to understand and maintain

---

**Pro Tip:** If your test is slow, you might be testing too much. Consider splitting into smaller, focused tests.
