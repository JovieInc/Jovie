# Test Coverage Analysis Report

## Executive Summary

This report analyzes the test coverage of the Jovie codebase and identifies areas requiring improvement. The project has a sophisticated testing infrastructure using Vitest (unit tests) and Playwright (E2E tests), but several critical areas have gaps in coverage.

**Overall Statistics (snapshot: 2026-01-31, pre-PR baseline):**

> _The counts below represent the codebase state **before** this PR. Tests added in this PR (e.g., `apps/web/tests/lib/queries/*.test.tsx`) are not reflected in these figures._

- **Total Test Files:** 351 (348 in apps/web + 3 in packages/ui)
- **Lines of Test Code:** ~68,000
- **Testing Frameworks:** Vitest 4.x, Playwright 1.55, Testing Library
- **Coverage Target:** 80% for patch coverage (new/modified lines)

---

## Critical Coverage Gaps

### 1. React Query Hooks (`lib/queries/`) - **CRITICAL**

**Files:** 48 hooks | **Current Tests:** 0

This is the most critical gap. The queries directory contains all React Query hooks that bridge the UI to API layer:

**Untested files include:**
- `useDashboardProfileQuery.ts` - Profile data fetching
- `useBillingMutations.ts` - Payment mutations
- `useAudienceQueries.ts` - Audience data
- `useAnalyticsQueries.ts` - Analytics data
- All dashboard query hooks

**Recommended Actions:**

```text
apps/web/tests/lib/queries/
├── useDashboardProfileQuery.test.tsx
├── useBillingMutations.test.tsx
├── useAudienceQueries.test.tsx
├── useAnalyticsQueries.test.tsx
└── ...
```

> **Note:** Use `.test.tsx` for files testing React hooks that render JSX (query/mutation hooks), and `.test.ts` for pure utility functions.

**Priority:** P0 - These hooks are used throughout the application

---

### 2. Custom Hooks (`hooks/`) - **CRITICAL**

**Files:** 30 hooks | **Current Tests:** 4 (13% coverage)

**Untested hooks (high priority):**
| Hook | Purpose | Risk Level |
|------|---------|------------|
| `useSignInFlow.ts` | Authentication flow | High |
| `useSignUpFlow.ts` | Registration flow | High |
| `useClerkSafe.tsx` | Auth state management | High |
| `useCreator.ts` | Creator context | High |
| `useKeyboardShortcuts.ts` | Keyboard navigation | Medium |
| `usePagination.ts` | List pagination | Medium |
| `useMediaQuery.ts` | Responsive design | Medium |
| `useMobile.ts` | Mobile detection | Medium |
| `useClipboard.ts` | Copy functionality | Medium |
| `useBreakpoint.ts` | Responsive breakpoints | Low |

**Recommended Test File Structure:**

```text
apps/web/tests/hooks/
├── useSignInFlow.test.tsx
├── useSignUpFlow.test.tsx
├── useClerkSafe.test.tsx
├── useCreator.test.tsx
├── useKeyboardShortcuts.test.tsx
└── ...
```

> **Note:** Hook tests typically use `.test.tsx` since they require React's `renderHook` and JSX wrapper components.

---

### 3. API Routes - Payment & Dashboard - **HIGH**

**Untested Routes:** 32 out of 86 (37%)

**Payment Routes (P0):**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/stripe/plan-change` | GET/POST/DELETE | Subscription changes |
| `/api/stripe/plan-change/preview` | POST | Proration preview |

**Dashboard CRUD Routes (P0):**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/dashboard/profile` | GET/PUT | User profile management |
| `/api/dashboard/social-links` | CRUD | Social links management |
| `/api/dashboard/pixels` | CRUD | Tracking pixels |
| `/api/dashboard/analytics` | GET | Analytics data |
| `/api/dashboard/audience/subscribers` | CRUD | Subscriber management |
| `/api/dashboard/audience/members` | CRUD | Audience members |

**Webhook Routes (P1):**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/webhooks/resend` | POST | Email delivery webhooks |
| `/api/email/track/open` | GET | Email tracking pixel |

**DSP Routes (P1):**
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/dsp/discover` | POST | Artist discovery |
| `/api/dsp/matches` | GET | List matches |
| `/api/dsp/matches/[id]/confirm` | POST | Confirm match |
| `/api/dsp/matches/[id]/reject` | POST | Reject match |

---

### 4. Email System (`lib/email/`) - **HIGH**

**Files:** 16 | **Current Tests:** 0

The entire email subsystem is untested:
- Email delivery logic
- Template rendering
- Campaign management
- Bounce/complaint handling

**Recommended Coverage:**

```text
apps/web/tests/lib/email/
├── delivery.test.ts
├── templates.test.ts
├── campaigns.test.ts
└── tracking.test.ts
```

---

### 5. Admin Components - **HIGH**

**Files:** 26 components | **Current Tests:** 0

The entire admin panel lacks component tests:

**Critical components:**
- `AdminCreatorFilters` - Creator filtering
- `BulkDeleteCreatorDialog` - Bulk operations
- `CreatorVerificationToggleButton` - Verification status
- `ImpersonationBanner` - Admin impersonation
- `IngestProfileDialog` - Profile ingestion
- `UserActionsMenu` - User actions
- `KpiCards` / `MetricsChart` - Analytics display

---

### 6. Dashboard Organisms - **HIGH**

**Files:** 19+ components | **Current Tests:** Minimal

These are critical user-facing components:

| Component | Purpose |
|-----------|---------|
| `DashboardHeader` | Main header |
| `DashboardAnalyticsCards` | Analytics display |
| `DashboardAudienceClient` | Audience management |
| `SettingsBillingSection` | Billing settings |
| `SettingsNotificationsSection` | Notification preferences |
| `ProfileEditorSection` | Profile editing |
| `OnboardingFormWrapper` | Onboarding flow |

---

### 7. Services Layer (`lib/services/`) - **HIGH**

**Files:** 12 | **Current Tests:** 0

Core business logic services are untested:
- Social links mutations/queries
- Profile operations
- Data transformations

---

### 8. Integration Tests - **MEDIUM**

**Current Tests:** 4

Only 4 integration tests exist:
- `admin-ingestion.test.ts`
- `analytics-tracking.test.ts`
- `middleware-proxy.test.ts`
- `rls-access-control.test.ts`

**Missing integration test scenarios:**
- Full user registration flow
- Complete billing cycle
- Profile creation to public view
- Email campaign flow
- DSP matching flow

---

### 9. Auth Components - **MEDIUM**

**Files:** 17 components | **Current Tests:** 1 (OtpInput only)

Untested auth components:
- `SignInForm` / `SignUpForm`
- `AuthFormContainer`
- `VerificationStep`
- `SsoCallbackHandler`

---

### 10. Database Layer (`lib/db/`) - **MEDIUM**

**Files:** 42 | **Covered:** Partial

Untested areas:
- `batch.ts` - Batch operations
- `cache.ts` - Caching logic
- `query-timeout.ts` - Timeout handling
- `sql-helpers.ts` - SQL utilities

---

## Coverage by Component

| Component | Files | Tested | Coverage |
|-----------|-------|--------|----------|
| `lib/queries/` | 48 | 0 | 0% |
| `hooks/` | 30 | 4 | 13% |
| `lib/email/` | 16 | 0 | 0% |
| `lib/services/` | 12 | 0 | 0% |
| `lib/pacer/` | 12 | 0 | 0% |
| Admin components | 26 | 0 | 0% |
| Dashboard organisms | 19 | ~3 | ~16% |
| Auth components | 17 | 1 | 6% |
| API routes | 86 | 54 | 63% |
| Integration tests | N/A | 4 | Low |

---

## Prioritized Recommendations

### Tier 1 - Critical (Implement Immediately)

1. **Add tests for `lib/queries/`** - These hooks power all data fetching
   - Start with: `useDashboardProfileQuery`, `useBillingMutations`
   - Test loading states, error handling, cache behavior

2. **Add tests for payment API routes**
   - `/api/stripe/plan-change` routes
   - Test proration calculations, error handling

3. **Add tests for auth hooks**
   - `useSignInFlow`, `useSignUpFlow`, `useClerkSafe`
   - Test authentication state transitions

### Tier 2 - High Priority (Next Sprint)

4. **Add tests for dashboard API routes**
   - Profile, social-links, analytics endpoints
   - Test authorization, validation, edge cases

5. **Add tests for email system**
   - Template rendering, delivery logic
   - Mock external services (Resend)

6. **Add admin component tests**
   - Focus on data mutation components first
   - Test confirmation dialogs, form validation

### Tier 3 - Medium Priority (Subsequent Sprints)

7. **Expand integration tests**
   - Add full user journey tests
   - Test cross-system interactions

8. **Add dashboard organism tests**
   - Complex components with state management
   - Test user interactions, loading states

9. **Add service layer tests**
   - `lib/services/` business logic
   - Test data transformations

### Tier 4 - Maintenance

10. **Improve hook coverage**
    - Utility hooks (`useClipboard`, `useMediaQuery`)
    - Less critical but increases overall coverage

---

## Test Infrastructure Observations

### Strengths

- Well-organized test directory structure
- Multiple Vitest configs for different scenarios (fast, CI, minimal)
- Good E2E coverage with Playwright
- Accessibility testing with axe-core
- Performance testing infrastructure
- Flaky test detection and quarantine system

### Areas for Improvement

- Coverage reporting could be more granular
- Missing contract tests for external API integrations
- No mutation testing
- Limited snapshot testing for UI components

---

## Suggested Test File Templates

### Query Hook Test Template

```typescript
// apps/web/tests/lib/queries/useDashboardProfileQuery.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';

describe('useDashboardProfileQuery', () => {
  it('fetches profile data successfully', async () => {
    // Test implementation
  });

  it('handles loading state', () => {
    // Test implementation
  });

  it('handles error state', async () => {
    // Test implementation
  });
});
```

### API Route Test Template

```typescript
// apps/web/tests/unit/api/stripe/plan-change.test.ts
import { POST, GET, DELETE } from '@/app/api/stripe/plan-change/route';
import { createMockRequest } from '@/tests/test-utils';

describe('/api/stripe/plan-change', () => {
  describe('POST', () => {
    it('changes plan successfully', async () => {
      // Test implementation
    });

    it('validates subscription exists', async () => {
      // Test implementation
    });
  });
});
```

---

## Metrics to Track

1. **Overall line coverage** - Target: 70%+
2. **Patch coverage** - Current target: 80%
3. **Critical path coverage** - Payment, auth flows
4. **Integration test count** - Target: 20+ scenarios
5. **E2E test pass rate** - Target: 99%+

---

## Conclusion

The Jovie codebase has a solid testing foundation but significant gaps in critical areas, particularly:

1. **Data layer** (React Query hooks) - 0% coverage
2. **Custom hooks** - 13% coverage
3. **Email system** - 0% coverage
4. **Payment API routes** - Missing tests
5. **Admin components** - 0% coverage

Addressing Tier 1 and Tier 2 priorities would significantly improve confidence in the codebase and reduce regression risk during deployments.
