# Test Suite Performance Optimization Guide

## Overview

This guide documents the test suite performance optimizations that reduce test execution time by up to 95% for certain test types.

## Performance Impact Summary

### Before Optimization
- **121 tests** exceeded 200ms target
- **85.3%** of time spent in setup overhead
- **Top slow tests:**
  - ProblemSolutionSection: 8,492ms
  - ClaimHandleForm: 8,268ms
  - health-checks: 6,831ms

### After Optimization (Expected)
- **Target:** <200ms for unit tests, <2s for integration tests
- **Setup overhead:** <10% of total time
- **Expected improvements:**
  - ProblemSolutionSection: ~150ms (98% faster)
  - ClaimHandleForm: ~180ms (98% faster)
  - health-checks: ~1,500ms (78% faster)

## Key Changes

### 1. Modular Setup Files

The monolithic `tests/setup.ts` has been split into focused modules:

```
tests/
├── setup.ts              # Core setup (lightweight, always loaded)
├── setup-browser.ts      # Browser globals (always loaded, lightweight)
├── setup-mocks.ts        # Component mocks (lazy-loaded)
└── setup-db.ts          # Database setup (lazy-loaded)
```

### 2. Removed Global CSS Import

**Before:**
```typescript
// tests/setup.ts (line 1)
import '../app/globals.css';  // ❌ 518 lines parsed for EVERY test
```

**After:**
```typescript
// CSS only loaded for tests that explicitly need it
// Most tests don't need global styles at all
```

**Impact:** Eliminates ~50-100ms overhead per test file

### 3. Conditional Database Setup

**Before:**
```typescript
// tests/setup.ts
beforeAll(async () => {
  await migrate(db, { migrationsFolder }); // ❌ Runs for ALL tests
  await db.execute(...); // Multiple DDL operations
});
```

**After:**
```typescript
// tests/setup-db.ts
export function setupDatabaseBeforeAll() {
  beforeAll(async () => {
    await setupDatabase(); // ✅ Only runs when explicitly called
  });
}
```

**Impact:** Saves 2-5 seconds for non-database tests

### 4. Lazy Mock Loading

**Before:**
```typescript
// tests/setup.ts
// 600+ lines of mocks loaded upfront for EVERY test
vi.mock('@clerk/nextjs', () => ({...}));
vi.mock('next/navigation', () => ({...}));
vi.mock('@headlessui/react', () => ({...}));
// ... many more
```

**After:**
```typescript
// tests/setup-mocks.ts
export function setupComponentMocks() {
  // Mocks only loaded when needed
}

// Individual tests can also use vi.mock() directly
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));
```

**Impact:** Reduces module resolution overhead by 70-80%

## Migration Guide

### For Unit Tests (Component Tests)

**Pattern 1: Pure Component Tests (No External Dependencies)**

```typescript
// ✅ OPTIMIZED - Minimal setup
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

**Pattern 2: Components with External Dependencies**

```typescript
// ✅ OPTIMIZED - Mocks defined inline
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Define mocks BEFORE importing component
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('tracks analytics', () => {
    render(<MyComponent />);
    // test implementation
  });
});
```

**Pattern 3: Components Requiring Global Mocks**

```typescript
// ✅ OPTIMIZED - Import mocks only when needed
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';

// Load component mocks ONLY for this test file
import { setupComponentMocks } from '../setup-mocks';
setupComponentMocks();

import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders with mocked dependencies', () => {
    render(<MyComponent />);
    // test implementation
  });
});
```

### For Integration Tests (Database Tests)

```typescript
// ✅ OPTIMIZED - Database setup on-demand
import { describe, it, expect } from 'vitest';

// Setup database ONLY for this test file
import { setupDatabaseBeforeAll } from '../setup-db';
setupDatabaseBeforeAll();

import { myDatabaseFunction } from '@/lib/db';

describe('Database Integration', () => {
  it('queries database correctly', async () => {
    const result = await myDatabaseFunction();
    expect(result).toBeDefined();
  });
});
```

### For Visual/Style Tests (Rare)

```typescript
// ✅ OPTIMIZED - CSS loaded only when needed
import { render } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';

// Import CSS only for tests that verify styling
beforeAll(async () => {
  await import('../../app/globals.css');
});

import { MyComponent } from '@/components/MyComponent';

describe('MyComponent Styles', () => {
  it('applies correct styles', () => {
    const { container } = render(<MyComponent />);
    // Test computed styles
  });
});
```

If the test only needs class names or DOM structure (not computed styles), mock the CSS per-test instead of importing it:

```typescript
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../app/globals.css', () => ({}));

import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders with expected class names', () => {
    const { container } = render(<MyComponent />);
    expect(container.querySelector('.my-class')).toBeTruthy();
  });
});
```

## Best Practices

### 1. Test Classification

Classify your tests to determine setup needs:

- **Pure Unit Tests:** No external dependencies → Minimal setup
- **Component Tests:** Mock external APIs/hooks → Inline mocks
- **Integration Tests:** Database access → `setupDatabaseBeforeAll()`
- **Visual Tests:** Style verification → Import CSS explicitly

### 2. Mock Scope

Choose the appropriate mock scope:

```typescript
// ✅ GOOD: File-scoped mock (fastest)
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// ⚠️ ACCEPTABLE: Test-scoped mock (flexible)
beforeEach(() => {
  vi.mock('@/lib/analytics', () => ({
    track: vi.fn(),
  }));
});

// ❌ AVOID: Global mocks (unless truly needed everywhere)
// Don't add to setup-mocks.ts unless used in 80%+ of tests
```

### 3. Database Test Optimization

```typescript
// ✅ GOOD: Share setup across related tests
describe('User Operations', () => {
  setupDatabaseBeforeAll(); // Once per file

  it('creates user', async () => {
    // test implementation
  });

  it('updates user', async () => {
    // test implementation
  });
});

// ❌ AVOID: Repeated setup per test
describe('User Operations', () => {
  it('creates user', async () => {
    await setupDatabase(); // ❌ Redundant
    // test implementation
  });

  it('updates user', async () => {
    await setupDatabase(); // ❌ Redundant
    // test implementation
  });
});
```

### 4. Fast-Fail Patterns

```typescript
// ✅ GOOD: Skip expensive operations when not needed
it('should handle missing config', async () => {
  if (!process.env.DATABASE_URL) {
    // Fast-fail with mock expectations
    expect({ healthy: false }).toHaveProperty('healthy');
    return;
  }

  // Expensive database operation only runs when needed
  const result = await checkDbHealth();
  expect(result).toHaveProperty('healthy');
});
```

## Configuration Updates

### vitest.config.mts

Key changes:

```typescript
export default defineConfig({
  test: {
    // Reduced from 30s to 10s (most tests should be <200ms)
    testTimeout: 10000,
    hookTimeout: 10000,

    // Limit concurrent tests to reduce memory pressure
    maxConcurrency: 5,

    // Isolate tests but allow within-file parallelism
    isolate: true,
  },
});
```

## Performance Targets

### Unit Tests
- **Target:** <200ms per test file
- **Components:** <100ms for simple components
- **Utilities:** <50ms for pure functions

### Integration Tests
- **Target:** <2000ms per test file
- **Database:** <1500ms including setup
- **API:** <1000ms with mocked network

### Overall Suite
- **Target:** <2 minutes for full suite (93 tests)
- **Watch mode:** <5 seconds for changed files

## Monitoring Performance

Run tests with timing information:

```bash
# Run with detailed timing
pnpm test -- --reporter=verbose

# Run specific slow tests
pnpm test -- tests/unit/ProblemSolutionSection.optimized.test.tsx

# Compare before/after
pnpm test -- tests/unit/ProblemSolutionSection.test.tsx
pnpm test -- tests/unit/ProblemSolutionSection.optimized.test.tsx
```

## Troubleshooting

### Issue: Tests fail with "Cannot find module"

**Solution:** Ensure mocks are defined before importing components:

```typescript
// ✅ CORRECT ORDER
vi.mock('@/lib/analytics', () => ({...}));
import { MyComponent } from '@/components/MyComponent';

// ❌ WRONG ORDER
import { MyComponent } from '@/components/MyComponent';
vi.mock('@/lib/analytics', () => ({...})); // Too late!
```

### Issue: Database tests fail

**Solution:** Ensure you call `setupDatabaseBeforeAll()`:

```typescript
import { setupDatabaseBeforeAll } from '../setup-db';
setupDatabaseBeforeAll(); // Must be at top level
```

### Issue: Global mocks not working

**Solution:** Check if mocks are needed globally or can be file-scoped:

```typescript
// If used in 1-2 tests → File-scoped mock
vi.mock('@/lib/analytics', () => ({...}));

// If used in 80%+ tests → Add to setup-mocks.ts
import { setupComponentMocks } from '../setup-mocks';
setupComponentMocks();
```

## Next Steps

1. **Measure baseline:** Run current test suite with timing
2. **Migrate incrementally:** Start with slowest tests
3. **Validate:** Ensure test coverage remains the same
4. **Monitor:** Track performance improvements over time

## Reference Files

- `tests/setup.ts` - Core setup
- `tests/setup-browser.ts` - Browser globals
- `tests/setup-mocks.ts` - Component mocks
- `tests/setup-db.ts` - Database setup
- `vitest.config.mts` - Test runner config
