# Testing Guide

## Test Tiers

| Tier | Tests | When | Time Target |
|------|-------|------|-------------|
| **Smoke** | Homepage, auth pages, protected routes, 404 | Every PR | < 10 min |
| **Full E2E** | All E2E specs including billing, visual | Main branch, `testing` label | 20-30 min |
| **Nightly** | Visual regression, a11y audit, synthetic golden path | Scheduled | Unlimited |

## Running Tests

### Unit Tests (Vitest)
```bash
# Fast (local development)
pnpm test

# CI mode with coverage
pnpm test:ci

# Watch mode
pnpm test:watch
```

### E2E Tests (Playwright)
```bash
# Full E2E suite
pnpm test:e2e

# Smoke tests only (fast)
SMOKE_ONLY=1 pnpm e2e:smoke

# Specific test file
pnpm test:e2e tests/e2e/smoke-public.spec.ts

# With UI
pnpm test:e2e:ui
```

## Smoke Test Files

Smoke tests are designed for **fast PR feedback** (< 10 min target):

- `smoke-public.spec.ts` - Public pages (no auth needed)
  - Homepage load, content, hydration
  - Public profile load
  - 404/error handling
  - Critical pages (/, /sign-up, /pricing)

- `smoke-auth.spec.ts` - Auth-related pages (requires Clerk)
  - Auth pages (signin/signup)
  - Protected route redirects

## Full Suite Files

These run on main branch and PRs with `testing` label:

- `billing.spec.ts` - Billing routes (/billing, /account, etc.)
- `onboarding-*.spec.ts` - Onboarding flows
- `profile.public.spec.ts` - Detailed profile features
- `visual-regression.spec.ts` - Screenshot comparisons
- `axe-audit.spec.ts` - Accessibility tests

## Adding New Tests

### When to add to smoke
Add to smoke **only if**:
- Tests a critical user path (auth, homepage, core features)
- Runs in < 30 seconds
- Doesn't require complex setup
- Failure would block a production deploy

### When to add to full suite
Add to full suite for:
- Feature detail tests
- Visual regression
- Accessibility audits
- Edge cases and error states
- Tests requiring database writes

## Performance Targets

| Test Type | Target |
|-----------|--------|
| Unit test (single) | < 200ms |
| Integration test (single) | < 2s |
| Smoke test (total) | < 10 min |
| Full E2E (total) | < 30 min |

## Tagging

Use `@smoke` tag for smoke-critical tests:
```typescript
test.describe('My Tests @smoke', () => {
  // These run in smoke suite
});
```

## CI Pipeline

```
PR created
    │
    ├── ci-fast (typecheck, lint) ─────────────────┐
    │                                               │
    └── ci-e2e-smoke (if E2E paths changed) ───────┤
                                                    │
                                                    ▼
                                            PR Ready to Merge
                                                    │
                                                    ▼
                                            Push to main
                                                    │
    ┌───────────────────────────────────────────────┘
    │
    ├── Full E2E (2 shards, Chrome + Firefox)
    ├── Unit Tests
    ├── Build + Lighthouse
    └── Deploy (if all pass)
```

## Troubleshooting

### Tests timing out
- Check if test is doing too much (should be < 30s)
- Verify network mocks are in place
- Consider moving to full suite if test is slow

### Flaky tests
- Add to `tests/quarantine.json` with owner and exit criteria
- Auto-unquarantined after 5 consecutive passes
- Run `pnpm test:flaky` to detect flaky tests

### Smoke suite too slow
- Target: < 10 min
- If over budget, move tests to full suite
- Consolidate redundant tests
