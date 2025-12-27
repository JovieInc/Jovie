# Technical Debt Audit - Jovie

> **Generated:** 2024-12-27
> **Status:** Active tracking document

## Summary

| Priority | Count | Categories |
|----------|-------|------------|
| 🔴 Critical | 10 | Security, Type Safety |
| 🟠 High | 39+ | Architecture, API, Performance |
| 🟡 Medium | 37 | Testing, Logging, Config |
| 🟢 Low | 21 | Legacy, DX |
| **Total** | **107+** | |

---

## 🔴 CRITICAL ISSUES

### CRIT-001: XSS Vulnerabilities - Unsanitized dangerouslySetInnerHTML

**Priority:** Critical
**Labels:** `security`, `bug`, `critical`
**Estimate:** 2-3 hours

#### Description
Multiple components use `dangerouslySetInnerHTML` without sanitization, creating XSS attack vectors.

#### Affected Files
| File | Line | Issue |
|------|------|-------|
| `components/profile/StaticListenInterface.tsx` | 159 | `dangerouslySetInnerHTML={{ __html: dsp.config.logoSvg }}` |
| `components/profile/AnimatedListenInterface.tsx` | 243 | Same unsanitized SVG injection |
| `components/molecules/BlogMarkdownReader.tsx` | 77 | Markdown HTML without DOMPurify |
| `components/molecules/LegalMarkdownReader.tsx` | 38 | Markdown HTML without DOMPurify |
| `app/(marketing)/changelog/page.tsx` | 39 | Changelog markdown unsanitized |

#### Solution
Add DOMPurify sanitization before rendering:
```typescript
import DOMPurify from 'dompurify';

// For SVG
const sanitizedSvg = DOMPurify.sanitize(logoSvg, { USE_PROFILES: { svg: true } });

// For HTML
const sanitizedHtml = DOMPurify.sanitize(htmlContent);
```

#### Acceptance Criteria
- [ ] All `dangerouslySetInnerHTML` usages sanitized with DOMPurify
- [ ] Unit tests verify sanitization
- [ ] No XSS possible via SVG or markdown content

---

### CRIT-002: Type Safety Bypass - @ts-nocheck in Critical API Route

**Priority:** Critical
**Labels:** `tech-debt`, `typescript`, `critical`
**Estimate:** 4-6 hours

#### Description
The dashboard profile API route has `@ts-nocheck` at line 1, completely bypassing TypeScript's type checking for the entire 489-line file. Additionally, there are 7 `@ts-expect-error` comments for Drizzle ORM type mismatches.

#### Affected Files
| File | Line | Issue |
|------|------|-------|
| `app/api/dashboard/profile/route.ts` | 1 | `// @ts-nocheck` - entire file |
| Same file | 139, 143, 145 | `@ts-expect-error` for DB queries |
| Same file | 417, 422, 433, 437 | `@ts-expect-error` for DB updates |

#### Root Cause
Drizzle ORM dual-version type conflicts between schema definitions and query operations.

#### Solution
1. Remove `@ts-nocheck`
2. Fix Drizzle type definitions in `lib/db/schema.ts`
3. Use proper type assertions or update Drizzle version
4. Replace `@ts-expect-error` with proper typing

#### Acceptance Criteria
- [ ] `@ts-nocheck` removed
- [ ] All `@ts-expect-error` comments resolved
- [ ] File passes `pnpm typecheck`

---

### CRIT-003: SQL Injection Pattern in Tests

**Priority:** Critical
**Labels:** `security`, `testing`
**Estimate:** 1-2 hours

#### Description
Test files use string interpolation in raw SQL queries, demonstrating a dangerous pattern that could be replicated in production code.

#### Affected Files
| File | Lines |
|------|-------|
| `tests/integration/rls-access-control.test.ts` | 95, 99, 113, 117, 129, 133, 146, 152, 171, 177 |

#### Current Code
```typescript
// VULNERABLE - string interpolation
drizzleSql.raw(`SET LOCAL app.clerk_user_id = '${userAClerkId}'`)
```

#### Solution
Use parameterized queries:
```typescript
drizzleSql.raw(`SET LOCAL app.clerk_user_id = $1`, [userAClerkId])
```

#### Acceptance Criteria
- [ ] All string interpolation in SQL replaced with parameters
- [ ] Add ESLint rule to prevent this pattern

---

### CRIT-004: Environment Variable Leak Risk

**Priority:** Critical
**Labels:** `security`, `architecture`
**Estimate:** 3-4 hours

#### Description
`lib/env.ts` imports both public (`NEXT_PUBLIC_*`) and secret environment variables. This module is imported by client components, risking secret leakage to client bundles.

#### Affected Files
| File | Issue |
|------|-------|
| `lib/env.ts` | Mixed public/secret vars |
| `components/providers/Analytics` | Client component importing env |
| `ClerkAppProvider` | Client component importing env |
| `app/my-statsig.tsx` | Client component importing env |

#### Solution
Split into two files:
1. `lib/env-server.ts` - Server-only secrets (with `import 'server-only'`)
2. `lib/env-public.ts` - Client-safe `NEXT_PUBLIC_*` vars

#### Acceptance Criteria
- [ ] `lib/env.ts` split into server/public modules
- [ ] Server module has `import 'server-only'`
- [ ] All imports updated
- [ ] Lint rule prevents client imports of server env

---

## 🟠 HIGH PRIORITY ISSUES

### HIGH-001: God Objects - Files Over 700 Lines

**Priority:** High
**Labels:** `tech-debt`, `refactor`, `architecture`
**Estimate:** 2-3 days

#### Description
15+ files exceed 700 lines, mixing multiple concerns and making maintenance difficult.

#### Affected Files
| File | Lines | Concerns |
|------|-------|----------|
| `scripts/drizzle-seed.ts` | 1,789 | Seed data + complex logic |
| `components/dashboard/organisms/EnhancedDashboardLinks.tsx` | 1,321 | UI + state + business logic |
| `lib/ingestion/processor.ts` | 1,103 | Extraction + DB + retry |
| `lib/utils/platform-detection.ts` | 1,001 | Platform detection + normalization |
| `components/dashboard/organisms/SettingsPolished.tsx` | 996 | Account + billing + avatar |
| `components/dashboard/organisms/links/hooks/useLinksManager.ts` | 920 | Hook with duplicate detection |
| `app/api/dashboard/social-links/route.ts` | 911 | Validation + ingestion + DB |
| `components/organisms/Sidebar.tsx` | 785 | Navigation + sidebar |
| `components/dashboard/organisms/AppleStyleOnboardingForm.tsx` | 787 | State machine + UI |
| `lib/stripe/customer-sync.ts` | 756 | Stripe sync logic |
| `components/dashboard/organisms/ReleaseProviderMatrix.tsx` | 758 | Release management |
| `components/dashboard/organisms/DashboardAudienceTable.tsx` | 747 | Audience table |
| `app/api/stripe/webhooks/route.ts` | 734 | Webhook handlers |
| `lib/db/index.ts` | 715 | DB client + utilities |
| `app/app/dashboard/actions.ts` | 684 | Multiple server actions |

#### Solution
Break each file into smaller, focused modules:
- Extract business logic to service layers
- Split UI components into smaller pieces
- Create dedicated utility modules

#### Acceptance Criteria
- [ ] No file exceeds 500 lines
- [ ] Each module has single responsibility
- [ ] Tests updated for new structure

---

### HIGH-002: Circular Dependencies - Architecture Violations

**Priority:** High
**Labels:** `tech-debt`, `architecture`
**Estimate:** 1-2 days

#### Description
14+ circular dependencies violate the proper layering: `domain → lib → components → app`

#### Lib → App Violations
| File | Imports From |
|------|--------------|
| `lib/notifications/domain.ts:3` | `@/app/api/audience/lib/audience-utils` |
| `lib/actions/creator.ts:4` | `@/app/dashboard/actions` |

#### Components → App Violations (12+)
| Component | Imports From App |
|-----------|------------------|
| `components/providers/StatsigProviders.tsx` | `@/app/my-statsig` |
| `components/organisms/AvatarUploadable.tsx` | `@/app/api/images/upload/route` |
| `components/dashboard/organisms/EnhancedDashboardLinks.tsx` | `@/app/app/dashboard/DashboardDataContext` |
| `components/dashboard/DashboardNav.tsx` | `@/app/app/dashboard/DashboardDataContext` |
| `components/dashboard/DashboardTipping.tsx` | `@/app/app/dashboard/DashboardDataContext` |
| `components/dashboard/DashboardAnalytics.tsx` | `@/app/app/dashboard/DashboardDataContext` |
| `components/dashboard/DashboardSettings.tsx` | `@/app/app/dashboard/DashboardDataContext` |
| `components/admin/AdminCreatorProfilesWithSidebar.tsx` | `@/app/app/dashboard/DashboardLayoutClient` |
| `components/admin/CreatorAvatarCell.tsx` | `@/app/admin/actions` |
| `components/dashboard/organisms/ContactsManager.tsx` | `@/app/app/dashboard/contacts/actions` |
| `components/dashboard/organisms/ReleaseProviderMatrix.tsx` | `@/app/app/dashboard/releases/actions` |
| `components/dashboard/organisms/LazyEnhancedDashboardLinks.tsx` | `@/app/app/dashboard/actions` |

#### Lib → Components Violations
| File | Imports From |
|------|--------------|
| `lib/hooks/useNotifications.ts` | `@/components/molecules/ToastContainer` |
| `lib/features.ts` | `@/components/atoms/Icon` |
| `lib/utils/toast-utils.ts` | `@/components/molecules/ToastContainer` |

#### Solution
1. Move shared contexts to `lib/contexts/`
2. Extract types to `types/` directory
3. Move audience utils to `lib/`
4. Create proper dependency injection

#### Acceptance Criteria
- [ ] No lib imports from app/
- [ ] No components imports from app/
- [ ] Add ESLint import boundaries rule

---

### HIGH-003: Missing API Input Validation

**Priority:** High
**Labels:** `security`, `api`, `validation`
**Estimate:** 4-6 hours

#### Description
Several API endpoints lack Zod schema validation, accepting unvalidated input.

#### Affected Endpoints
| Endpoint | Issue |
|----------|-------|
| `app/api/track/route.ts:85-98` | Manual validation instead of Zod |
| `app/api/featured-creators/route.ts` | No validation at all |
| `app/api/admin/creator-avatar/route.ts:34-42` | Manual validation |
| `app/api/billing/status/route.ts` | No request validation |
| `app/api/dashboard/profile/route.ts` | Free-form `updates` object |
| `app/api/create-tip-intent/route.ts` | No range validation on `amount` |

#### Solution
Add Zod schemas for all API inputs:
```typescript
import { z } from 'zod';

const trackSchema = z.object({
  linkId: z.string().uuid(),
  linkType: z.enum(['social', 'release', 'provider']),
  // ...
});
```

#### Acceptance Criteria
- [ ] All POST/PUT/PATCH endpoints have Zod validation
- [ ] Validation errors return proper 400 responses
- [ ] Tests cover validation edge cases

---

### HIGH-004: Missing Retry Logic for External APIs

**Priority:** High
**Labels:** `reliability`, `api`
**Estimate:** 3-4 hours

#### Description
External API calls lack retry logic with exponential backoff.

#### Affected Files
| File | API | Issue |
|------|-----|-------|
| `app/api/spotify/search/route.ts:95-98` | Spotify | No retry |
| `app/api/stripe/checkout/route.ts:87-91` | Stripe | No retry on rate limit |
| `app/api/dashboard/analytics/route.ts:85-89` | Database | No retry |
| `app/api/capture-tip/route.ts:65-71` | Database | No retry |
| `lib/ingestion/strategies/base.ts` | External URLs | Limited retry |

#### Solution
Create shared retry utility:
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: 3, backoff: 'exponential' }
): Promise<T>
```

#### Acceptance Criteria
- [ ] All external API calls use retry utility
- [ ] Exponential backoff implemented
- [ ] Circuit breaker for persistent failures

---

### HIGH-005: N+1 Query Patterns

**Priority:** High
**Labels:** `performance`, `database`
**Estimate:** 3-4 hours

#### Description
Database queries in loops causing N+1 performance issues.

#### Affected Files
| File | Lines | Issue |
|------|-------|-------|
| `lib/discog/queries.ts` | 54-100 | Fetches ALL provider links, filters in JS |
| `lib/ingestion/processor.ts` | 302-347 | Sequential `await` in loop |
| `lib/ingestion/processor.ts` | 701-723 | Loop with sequential DB updates |
| `lib/ingestion/processor.ts` | 740-749 | Loop with sequential DB updates |

#### Solution for discog/queries.ts
```typescript
// Before: Fetch all, filter in JS
const allLinks = await db.select().from(providerLinks).where(eq(ownerType, 'release'));
const filtered = allLinks.filter(l => releaseIds.has(l.releaseId));

// After: Filter in database
const links = await db.select().from(providerLinks).where(
  and(
    eq(ownerType, 'release'),
    inArray(providerLinks.releaseId, releaseIds)
  )
);
```

#### Acceptance Criteria
- [ ] No database queries inside loops
- [ ] Use `inArray()` for batch filtering
- [ ] Use `Promise.all()` for parallel operations

---

### HIGH-006: Skipped Tests - Security & Core Features

**Priority:** High
**Labels:** `testing`, `tech-debt`
**Estimate:** 1-2 days

#### Description
21 tests are skipped, including critical security and feature tests.

#### Critical Skipped Tests
| Test | File | Risk |
|------|------|------|
| `describe.skip('EnhancedDashboardLinks')` | Unit tests | Main links component untested |
| `describe.skip('RLS access control (database)')` | Integration | Security tests disabled |
| `describe.skip('profile views metrics')` | Unit | Analytics untested |
| E2E: `golden-path.spec.ts` | E2E | Core flow untested |
| E2E: `onboarding.happy.spec.ts` | E2E | Onboarding untested |
| E2E: `onboarding.live-profile.spec.ts` | E2E | Live profile untested |
| E2E: `releases-dashboard.spec.ts` | E2E | Releases untested |

#### Acceptance Criteria
- [ ] All `.skip()` tests re-enabled and passing
- [ ] RLS tests validate security policies
- [ ] E2E golden path tests pass

---

## 🟡 MEDIUM PRIORITY ISSUES

### MED-001: Replace Console Logging with Structured Logging

**Priority:** Medium
**Labels:** `tech-debt`, `observability`
**Estimate:** 4-6 hours

#### Description
401 `console.*` statements in `/apps/web` should use Sentry structured logging.

#### Solution
Replace:
```typescript
console.error('Failed to process', { error });
```
With:
```typescript
import * as Sentry from '@sentry/nextjs';
Sentry.captureException(error, { extra: { context: 'processing' } });
```

#### Acceptance Criteria
- [ ] All console.error → Sentry.captureException
- [ ] All console.warn → Sentry.captureMessage (warning level)
- [ ] Add ESLint rule to prevent console in production

---

### MED-002: Extract Magic Numbers to Constants

**Priority:** Medium
**Labels:** `tech-debt`, `maintainability`
**Estimate:** 2-3 hours

#### Description
Hardcoded numbers throughout codebase without explanation.

#### Affected Files
| File | Value | Purpose |
|------|-------|---------|
| `lib/services/link-wrapping.ts:73` | `5` | Max retry attempts |
| `lib/services/link-wrapping.ts:185` | `5000` | Timeout ms |
| `lib/services/link-wrapping.ts:199` | `12` | Short ID length |
| `lib/spotify.ts:223` | `50` | Album fetch limit |
| `lib/spotify.ts:328` | `20` | Batch size |
| `app/api/spotify/search/route.ts:40` | `5 * 60 * 1000` | Cache TTL |
| `lib/music/discography.ts:71-73` | `3, 2, 1` | Source priority |

#### Solution
Create `lib/constants/index.ts`:
```typescript
export const RETRY = {
  MAX_ATTEMPTS: 5,
  TIMEOUT_MS: 5000,
} as const;

export const SPOTIFY = {
  ALBUM_FETCH_LIMIT: 50,
  BATCH_SIZE: 20,
  CACHE_TTL_MS: 5 * 60 * 1000,
} as const;
```

---

### MED-003: Fix Loose Equality Operators

**Priority:** Medium
**Labels:** `tech-debt`, `code-quality`
**Estimate:** 2-3 hours

#### Description
343 instances of `!=` instead of `!==` throughout codebase.

#### Solution
1. Add ESLint rule `eqeqeq: 'error'`
2. Run `pnpm lint --fix`
3. Manually review remaining cases

---

### MED-004: Standardize API Response Format

**Priority:** Medium
**Labels:** `api`, `dx`
**Estimate:** 3-4 hours

#### Description
Inconsistent error response formats across endpoints.

#### Current Inconsistencies
| Endpoint | Format |
|----------|--------|
| `/api/audience/click` | `{ success: true, fingerprint }` |
| `/api/featured-creators` | `{ error: string }` |
| `/api/handle/check` | `{ error: string, code: string }` |
| `/api/notifications/subscribe` | `{ success: false, error, code }` |

#### Solution
Create standardized response helpers:
```typescript
// lib/api/response.ts
export function successResponse<T>(data: T) {
  return NextResponse.json({ success: true, data });
}

export function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}
```

---

### MED-005: Update Deprecated Dependencies

**Priority:** Medium
**Labels:** `dependencies`, `security`
**Estimate:** 2-3 hours

#### Deprecated Packages
| Package | Issue | Action |
|---------|-------|--------|
| `tmp` | CWE-59 vulnerability | Update to >=0.2.3 |
| `critters@0.0.25` | Ownership moved | Evaluate alternatives |
| `expect-playwright` | Deprecated | Use Playwright built-ins |
| `jest-process-manager` | Deprecated | Remove or replace |
| `commitizen@>=3.0.1` | Indirect vuln | Update to 3.0.0 |

---

### MED-006: Component Memoization

**Priority:** Medium
**Labels:** `performance`, `react`
**Estimate:** 4-6 hours

#### Description
96% of components (332/346) lack memoization, causing unnecessary re-renders.

#### High-Impact Components to Memoize
- Dashboard components with heavy state
- List items in virtualized lists
- Components receiving stable object props

---

## 🟢 LOW PRIORITY ISSUES

### LOW-001: Consolidate Configuration Files

**Priority:** Low
**Labels:** `dx`, `cleanup`
**Estimate:** 1-2 hours

#### Description
Multiple config files for same tools.

#### Files to Consolidate
- `playwright.config.ts`, `playwright.config.noauth.ts`, `playwright.synthetic.config.ts` → Single config with projects
- `vitest.config.mts`, `vitest.config.fast.mts` → Single config with workspaces

---

### LOW-002: Standardize Hook Locations

**Priority:** Low
**Labels:** `dx`, `organization`
**Estimate:** 1-2 hours

#### Current Locations
- `/hooks/` (global)
- `/lib/hooks/` (lib)
- `/components/organisms/hooks/`
- `/components/dashboard/organisms/links/hooks/`

#### Solution
Consolidate to `/hooks/` with subdirectories by domain.

---

### LOW-003: Remove Legacy Patterns

**Priority:** Low
**Labels:** `cleanup`, `tech-debt`
**Estimate:** 2-3 hours

#### Legacy Code
| Pattern | Location |
|---------|----------|
| Deprecated media query API | `components/profile/DesktopQrOverlay.tsx:87-119` |
| Legacy YouTube URL handling | `lib/utils/platform-detection.ts` |
| Legacy JSONB payload handling | `lib/ingestion/jobs.ts:47,60` |
| Legacy encryption fallbacks | `lib/pii-encryption.ts` |

---

### LOW-004: Add Missing JSDoc

**Priority:** Low
**Labels:** `documentation`, `dx`
**Estimate:** 3-4 hours

#### Complex Functions Needing Docs
| File | Function |
|------|----------|
| `lib/services/link-wrapping.ts:71-131` | `createRecord()` |
| `lib/services/link-wrapping.ts:183-275` | `getWrappedLink()` |
| `lib/spotify.ts:205-268` | `getSpotifyArtistAlbums()` |
| `lib/deep-links.ts:200-261` | `createDeepLink()` |
| `lib/db/index.ts:72-100` | Database error logging |

---

### LOW-005: Add Missing Return Types

**Priority:** Low
**Labels:** `typescript`, `dx`
**Estimate:** 1-2 hours

#### Functions Missing Return Types
| File | Function |
|------|----------|
| `lib/analytics.ts:61-66` | `flushQueue()` |
| `lib/analytics.ts:68-88` | `withAnalyticsGuard()` |
| `lib/dsp.ts:54-137` | `getAvailableDSPs()` |

---

## Tracking

### Sprint Assignments

| Sprint | Issues | Status |
|--------|--------|--------|
| Sprint 1 | CRIT-001, CRIT-002, CRIT-003, CRIT-004 | 🔲 Not Started |
| Sprint 2 | HIGH-001, HIGH-002, HIGH-003 | 🔲 Not Started |
| Sprint 3 | HIGH-004, HIGH-005, HIGH-006 | 🔲 Not Started |
| Sprint 4 | MED-001, MED-002, MED-003 | 🔲 Not Started |
| Backlog | MED-004, MED-005, MED-006, LOW-* | 🔲 Backlog |

### Progress

- [ ] **Critical:** 0/4 complete
- [ ] **High:** 0/6 complete
- [ ] **Medium:** 0/6 complete
- [ ] **Low:** 0/5 complete

---

## References

- [Agents Guide](../agents.md) - AI agent development guidelines
- [SECURITY_NOTES.md](../SECURITY_NOTES.md) - Security documentation
