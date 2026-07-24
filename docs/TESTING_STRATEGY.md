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

### Combined-head CI (GitHub merge queue)
- All deterministic source checks on the synthetic SHA
- Five affected unit-test shards
- Drizzle migration validation
- One hosted build + layout workspace
- Path-selected hosted Xcode build and test

### Deep CI (hosted manual, scheduled, or event-driven)
- E2E and smoke suites
- Preview, Lighthouse, a11y, and Storybook evidence
- Exhaustive security, model, and long-running suites

PR labels are metadata only and do not trigger a heavy CI lane.

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

### Stage Contract

| Stage | Exact responsibility |
| --- | --- |
| Source PR | Deterministic path + brand classification, risk classification, `ci-fast`, and diff secret scan. `Migration Guard`, `Fork PR Gate`, and `PR Size Guard` remain separate required contexts. |
| Native merge queue | Re-run deterministic gates on the exact `merge_group` head, then require five affected unit shards, one hosted build + layout workspace, path-selected Xcode, and model-free semantic evals. |
| Queue-proven main | Reuse the exact successful merge-group `PR Ready` proof and skip duplicate fallback work. |
| Direct/admin main | Fail closed through path/risk/fast/secret/migration, all five unit shards, and the combined hosted build + layout job; skipped placeholders are invalid. |
| Production release | One reusable staging/canary/promotion/rollback DAG under one non-cancelling caller lease. |
| Post-deploy | Hosted public, auth, homepage, and explicitly provisioned Lighthouse probes settle into `Production Verified` before notification. |
| Scheduled/manual/event | Exhaustive E2E, Neon, a11y, performance, eval, visual, slop, brand, and repair/report loops. |

### Tiers

| Tier | Purpose | Merge-gate jobs |
| --- | --- | --- |
| Source Fast Gate | Cheap deterministic checks required on each source PR and repeated on the synthetic combined head. | `Path Changes` (both), `ci-fast` (both), `Secret Scan (gitleaks + trufflehog)` (both), `Migration Guard` (both), `Unit Tests` (merge-group) |
| Structural Contract | Mechanical architecture, workflow, docs, and repo-rule checks. | `CI Risk Classifier` (both) |
| Explicit Deep Evidence | Manual, scheduled, or event-driven deep evidence that never starts from or delays ordinary PR Ready. | none |
| Preview Evidence | Hosted manual/event visual, a11y, performance, and preview evidence outside the source-PR event. | none |
| Combined Integration | Affected unit, one hosted build-plus-layout workspace, path-selected Xcode, and model-free semantic evals for GitHub's exact merge-group head. | `Build + Layout (combined)` (merge-group), `iOS Build + Test (combined)` (merge-group), `Promptfoo Evals (deterministic)` (merge-group), `Golden Eval Set (deterministic)` (merge-group) |
| Production Release | Each exact successful main CI attempt feeds one fixed production-mutation FIFO from authorization through staging, promotion, centralized rollback, immutable probes, canonical proof, marker, and best-effort notification; one hosted monitor retry is bounded to controller attempt 1. | none |
| Post-deploy Verification | Hosted public, homepage, and Lighthouse probes target the immutable release URL under the controller lease; authenticated smoke runs only when a complete credential pair exists, while public Better Auth/OAuth gates remain blocking. When a controller generation is superseded before those in-lease probes run, a read-only follow-up re-probes the landed canonical production deployment outside the lease. | none |
| Scheduled Cleanup | Report-first cleanup loops for flakes, coverage drift, harness health, and main-CI repair. | none |

### Merge Gates

Source `PR Ready` may require only `source-pr`/`both` jobs below. Merge-group `PR Ready` may require only `merge-group`/`both` jobs. Informational evidence stays out of both required aggregates.

| Job | Gate stage | Tier | Local remediation command |
| --- | --- | --- | --- |
| `Path Changes` | both | fast-gate | `git diff --name-only origin/main...HEAD` |
| `ci-fast` | both | fast-gate | `pnpm run typecheck && pnpm run biome:check` |
| `CI Risk Classifier` | both | structural-contract | `pnpm ci:harness:check` |
| `Secret Scan (gitleaks + trufflehog)` | both | fast-gate | `./scripts/security/scan-secrets.sh ci-pr origin/main` |
| `Migration Guard` | both | fast-gate | `cd apps/web && ./scripts/check-migrations.sh && ./scripts/validate-migrations.sh` |
| `Unit Tests` | merge-group | fast-gate | `pnpm --filter=@jovie/web run test:fast` |
| `Build + Layout (combined)` | merge-group | combined-integration | `pnpm run build:web && pnpm --filter @jovie/web exec playwright test tests/e2e/hud-scroll.spec.ts --config=playwright.config.noauth.ts --project=chromium` |
| `iOS Build + Test (combined)` | merge-group | combined-integration | `pnpm run ios:lint && pnpm run ios:test` |
| `Promptfoo Evals (deterministic)` | merge-group | combined-integration | `pnpm run evals` |
| `Golden Eval Set (deterministic)` | merge-group | combined-integration | `pnpm run evals:golden` |

### Risk Signals and Opt-in Evidence

Sensitive changes are classified deterministically on source PRs. Smoke and preview are routing signals for hosted manual, scheduled, or event-driven evidence; no PR label allocates a heavy source-event lane. The generic `testing`, `deep-ci`, `launch-candidate`, and `deploy-preview` labels have no CI fan-out semantics.

| Surface | Level | Smoke | Preview | Blocks unattended auto-merge |
| --- | --- | --- | --- | --- |
| CI and workflow control plane | high | yes | yes | no |
| Agent control plane | high | yes | no | no |
| Auth and identity | high | yes | yes | no |
| Activation, AI, and background data flows | high | yes | yes | no |
| Billing and money movement | high | yes | yes | no |
| Database and migrations | high | yes | no | no |
| Proxy and middleware | high | yes | yes | no |
| Environment and runtime config | high | yes | yes | no |
| Public UI and profile surfaces | medium | no | yes | no |
<!-- ci-harness:end -->
