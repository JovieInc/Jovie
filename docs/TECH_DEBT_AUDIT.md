# Tech Debt Audit Report

**Generated:** 2026-01-03
**Branch:** `claude/audit-tech-debt-dQNmv`

---

## Executive Summary

This audit identifies technical debt across the Jovie codebase. The findings are categorized by severity and type to help prioritize remediation efforts.

| Category | Count | Severity |
|----------|-------|----------|
| TODOs/FIXMEs | 6 | Medium |
| Console statements | 100+ | Low |
| TypeScript `any` usage | 100+ | Medium |
| Deprecated code files | 30+ | Medium |
| `@ts-ignore`/`@ts-nocheck` | 50+ | High |
| eslint-disable comments | 40+ | Medium |
| Empty catch blocks | 1 | High |
| PostHog remnants | 20+ | Medium |

---

## 1. TODO/FIXME/HACK Comments

**Severity: Medium** | **Count: 6**

Incomplete implementations that need attention:

| File | Line | Comment |
|------|------|---------|
| `tests/e2e/synthetic-golden-path.spec.ts` | 3 | TODO: Use Clerk testing token |
| `components/admin/ActivityTable.tsx` | 12 | TODO: extend activity feed with additional admin event data |
| `lib/audit/ingest.ts` | 195 | TODO: When database table is available, write to it |
| `lib/audit/ingest.ts` | 198 | TODO: When external audit service is available, send to it |
| `app/api/monitoring/performance/route.ts` | 38 | TODO: Integrate with analytics service |
| `components/admin/ReliabilityCard.tsx` | 5 | TODO: extend reliability metrics |

**Recommendation:** Review and either complete these items or convert to GitHub Issues for tracking.

---

## 2. Console Statements in Production Code

**Severity: Low** | **Count: 100+**

Console statements found in non-test files that should be replaced with proper logging:

### High Priority (Production Routes)
- `app/[username]/page.tsx:124` - `console.error` in public profile page
- `app/[username]/page.tsx:362` - `console.error` in generateStaticParams
- `lib/admin/overview.ts` - Multiple `console.error` and `console.warn` calls
- `lib/errors/ingest.ts:277-286` - Error logging in ingest system
- `proxy.ts:372` - API request logging

### Acceptable (Scripts/Tools)
- `scripts/*.ts` - CLI output is appropriate
- `tools/codemods/*.ts` - Migration tool output is appropriate

**Recommendation:** Replace production console calls with Sentry logging (as specified in agents.md Section 15).

---

## 3. TypeScript `any` Type Usage

**Severity: Medium** | **Count: 100+**

Loose typing reduces type safety. Categories:

### Tests (Acceptable but improvable)
Most `any` usage is in test files for mocking purposes:
- `tests/unit/*.test.tsx` - Mock implementations
- `tests/e2e/*.spec.ts` - Window/Clerk type casting
- `.storybook/*.ts` - Action mocks

### Production Code (Needs attention)
- `lib/env-server.ts:316` - Process type casting
- `lib/stripe/customer-sync/types.ts:234` - Dynamic field mapping

**Recommendation:**
1. Add proper type definitions for Clerk window interface
2. Create mock types for test files
3. Fix production `any` usages with proper types

---

## 4. Deprecated Code Files

**Severity: Medium** | **Count: 30+ files**

Files marked `@deprecated` that should be migrated away from:

### Database Layer
| File | Replacement |
|------|-------------|
| `lib/db/queries.ts` | `@/lib/services/profile` |
| `lib/db/schema.ts` | `@/lib/db/schema/` directory |

### Rate Limiting
| File | Replacement |
|------|-------------|
| `lib/utils/rate-limit.ts` | `@/lib/rate-limit` |
| `lib/analytics/tracking-rate-limit.ts` | `@/lib/rate-limit` |
| `lib/rate-limit/index.ts` (partial) | Use specific limiter instances |

### Components
| File | Replacement |
|------|-------------|
| `components/atoms/ArtistAvatar.tsx` | Use `Avatar` directly |
| `components/organisms/Sidebar.tsx` | See component docs |
| `components/dashboard/DashboardTipping.tsx` | New tipping module |

### Dashboard Actions
| File | Replacement |
|------|-------------|
| `app/app/dashboard/actions/profile-selection.ts` | `@/lib/db/server` |
| `app/app/dashboard/actions/tipping-stats.ts` | `@/lib/db/server` |

### Other
| File | Replacement |
|------|-------------|
| `lib/validation/schemas/dashboard.ts` | New validation location |
| `lib/stripe/customer-sync.ts` | Refactored module |
| `lib/ingestion/processor.ts` | Direct imports deprecated |
| `lib/waitlist/access.ts` | `@/lib/auth/gate` |
| `lib/hooks/useNotifications.ts` (partial) | Use `useNotifications` |

**Recommendation:** Create migration tasks to update imports and remove deprecated files.

---

## 5. TypeScript Escape Hatches

**Severity: High** | **Count: 50+**

### `@ts-nocheck` Files (Critical)
| File | Reason |
|------|--------|
| `app/api/dashboard/profile/route.ts` | Drizzle dual-version type mismatch |

**This is the only `@ts-nocheck` file** - high priority to fix.

### `@ts-ignore` / `@ts-expect-error` Usage
Most are due to:

1. **Drizzle ORM version mismatch** (8 occurrences)
   - `app/api/dashboard/profile/route.ts` - Multiple lines
   - `app/api/images/status/[id]/route.ts` - 5 occurrences
   - `app/api/images/upload/route.ts` - 4 occurrences

2. **Test mocking** (10+ occurrences)
   - E2E tests accessing `window.Clerk`
   - Unit tests mocking global objects

3. **Browser API quirks** (2 occurrences)
   - `hooks/useTouchDevice.ts` - IE/Edge specific property
   - `components/providers/ErrorBoundary.tsx` - gtag not typed

**Recommendation:**
1. Update Drizzle ORM to resolve version mismatch
2. Create proper type definitions for Clerk window interface
3. Add global type augmentations for browser APIs

---

## 6. ESLint Disable Comments

**Severity: Medium** | **Count: 40+**

### Categories

**`react-hooks/exhaustive-deps`** (5 occurrences)
- `components/dashboard/organisms/DashboardAnalyticsCards.tsx:75`
- `components/dashboard/molecules/universal-link-input/useUniversalLinkInput.ts:119,302`
- `components/dashboard/organisms/links/hooks/useLinksPersistence.ts:334`

**`@typescript-eslint/no-unused-vars`** (5 occurrences)
- Intentionally unused variables (prefixed with `_`)

**`@typescript-eslint/no-explicit-any`** (10+ occurrences)
- Mostly in test files for mocking

**`react-hooks/incompatible-library`** (3 occurrences)
- TanStack Table integration

**`no-console`** (4 occurrences)
- Smoke test utilities

**Recommendation:** Review exhaustive-deps suppressions for potential bugs.

---

## 7. Empty Catch Blocks

**Severity: High** | **Count: 1**

```typescript
// app/layout.tsx:171
} catch (e) {}
```

**Recommendation:** Add proper error handling or logging.

---

## 8. PostHog References (Per agents.md - Statsig Only)

**Severity: Medium** | **Count: 20+**

The agents.md specifies "Statsig-only" for analytics, but PostHog references remain:

### Files with PostHog mentions
- `lib/error-tracking.ts` - Used as "secondary sink" for errors
- `app/api/wrap-link/route.ts` - Comments reference PostHog
- `app/api/dashboard/profile/route.ts` - Runtime comment mentions PostHog
- `tests/e2e/tipping.spec.ts` - Test mocking PostHog
- `lib/server-analytics.ts` - Comment about PostHog delegation

**Note:** Some PostHog usage appears intentional for error tracking backup. Verify with team whether this should be migrated to Statsig.

---

## 9. Large Files Needing Refactoring

**Severity: Low** | Files over 700 lines

| File | Lines | Notes |
|------|-------|-------|
| `tests/unit/useFormState.test.tsx` | 2,116 | Test file - consider splitting |
| `scripts/drizzle-seed.ts` | 1,789 | Seed script - acceptable |
| `tests/unit/api/dashboard/social-links.test.ts` | 1,107 | Consider splitting |
| `tests/unit/lib/stripe/webhooks/handlers/payment-handler.test.ts` | 982 | Large test suite |
| `tests/unit/links/useLinksManager.test.ts` | 920 | Large test suite |
| `constants/platforms.ts` | 872 | Constants file - acceptable |

---

## 10. Documentation Files to Clean Up

Multiple planning/tracking markdown files in root that may be stale:

- `PERFORMANCE_ISSUES_REPORT.md`
- `PROGRESSIVE_ONBOARDING.md`
- `FEATURED_ARTISTS_IMAGE_IMPROVEMENTS.md`
- `SHADECN_UI_REFACTOR_TASKS.md`
- `ARTIST_PROFILE_UPDATES.md`
- `SEO_ENHANCEMENTS.md`
- `ARTIST_CAROUSEL.md`
- `PLAN-releases-page.md`
- `DIAGNOSIS.md`
- `COMPONENT_REFACTORING.md`
- `REFACTORING_PLAN.md`

**Recommendation:** Review and archive completed/outdated docs, or move to `.windsurf/todos/`.

---

## Priority Remediation Roadmap

### P0 - Critical (This Sprint)
1. Fix `@ts-nocheck` in `app/api/dashboard/profile/route.ts`
2. Fix empty catch block in `app/layout.tsx`
3. Update Drizzle ORM to resolve type mismatches

### P1 - High (Next 2 Sprints)
1. Replace console.* calls in production with Sentry logging
2. Migrate deprecated `lib/db/queries.ts` usages
3. Review react-hooks/exhaustive-deps suppressions

### P2 - Medium (Backlog)
1. Add proper Clerk window types to avoid `as any` in E2E tests
2. Complete TODO items or convert to GitHub Issues
3. Clean up deprecated rate-limit files
4. Review PostHog vs Statsig policy

### P3 - Low (Nice to Have)
1. Split large test files
2. Archive stale documentation
3. Add types to test mocks

---

## Metrics for Tracking Progress

Track these metrics over time:

| Metric | Current | Target |
|--------|---------|--------|
| `@ts-nocheck` files | 1 | 0 |
| `@ts-ignore` occurrences | ~20 | <5 |
| Deprecated files | 30+ | 0 |
| TODO comments | 6 | 0 |
| Empty catch blocks | 1 | 0 |

---

*Report generated by tech debt audit on `claude/audit-tech-debt-dQNmv` branch*
