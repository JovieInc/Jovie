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

<!-- ci-harness:start -->
## CI Agent Harness

Generated from `.github/ci-harness/manifest.json`. Do not hand-edit this block; run `pnpm ci:harness:docs` after changing the manifest.

### Tiers

| Tier | Purpose | Merge-gate jobs |
| --- | --- | --- |
| Fast Gate | Cheap deterministic checks required for every merge candidate. | `ci-fast`, `Unit Tests` |
| Structural Contract | Mechanical architecture, workflow, docs, and repo-rule checks. | `Structural Contract`, `CI Risk Classifier` |
| Risk-Triggered Smoke | Focused smoke validation for sensitive auth, billing, DB, config, and agent-control-plane changes. | `E2E Smoke (PR Fast Feedback)`, `Golden Path (PR)` |
| Preview Evidence | Preview deploys and visual/a11y/performance evidence for review. | `Build (public routes)`, `Lighthouse (public routes PR)`, `Lighthouse (dashboard PR)`, `Lighthouse (onboarding PR)`, `Lighthouse (admin PR)`, `Preview Deploy (PR)` |
| Main Deploy | Post-merge staging, canary, production promotion, and deploy-health gates. | none |
| Scheduled Cleanup | Report-first cleanup loops for flakes, coverage drift, harness health, and main-CI repair. | none |

### Merge Gates

`PR Ready` may require only jobs declared as merge gates below. Informational jobs must stay out of the aggregate merge gate.

| Job | Tier | Local remediation command |
| --- | --- | --- |
| `ci-fast` | fast-gate | `pnpm run typecheck && pnpm run biome:check` |
| `Structural Contract` | structural-contract | `pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm doc:freshness:check && pnpm test:reliability-detectors` |
| `CI Risk Classifier` | structural-contract | `pnpm ci:harness:check` |
| `Unit Tests` | fast-gate | `pnpm --filter=@jovie/web run test:fast` |
| `Build (public routes)` | preview-evidence | `pnpm run build:web` |
| `Lighthouse (public routes PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:public:launch` |
| `Lighthouse (dashboard PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:dashboard:pr` |
| `Lighthouse (onboarding PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:onboarding:pr` |
| `Lighthouse (admin PR)` | preview-evidence | `pnpm --filter=@jovie/web run test:lighthouse:admin:pr` |
| `E2E Smoke (PR Fast Feedback)` | risk-triggered-smoke | `pnpm run test:web:smoke` |
| `Golden Path (PR)` | risk-triggered-smoke | `doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web run test:e2e:golden-path:ci` |
| `Preview Deploy (PR)` | preview-evidence | `pnpm run build:web` |

### Risk-Triggered Evidence

Sensitive changes are classified deterministically before auto-merge. High-risk changes require smoke and/or preview evidence and block unattended auto-merge.

| Surface | Level | Smoke | Preview | Blocks unattended auto-merge |
| --- | --- | --- | --- | --- |
| CI and workflow control plane | high | yes | no | no |
| Agent control plane | high | yes | no | no |
| Auth and identity | high | yes | yes | no |
| Activation, AI, and background data flows | high | yes | yes | no |
| Billing and money movement | high | yes | yes | no |
| Database and migrations | high | yes | no | no |
| Proxy and middleware | high | yes | yes | no |
| Environment and runtime config | high | yes | yes | no |
| Public UI and profile surfaces | medium | no | yes | no |
<!-- ci-harness:end -->
