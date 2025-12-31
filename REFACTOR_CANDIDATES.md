# Top Refactor Candidates - Analysis Report

> **Generated:** 2025-12-31
> **Branch:** `claude/identify-refactor-candidates-WhH2N`

## Executive Summary

This report identifies the highest-impact refactoring opportunities in the Jovie codebase. Analysis was conducted using file size metrics, complexity indicators, duplication patterns, and alignment with existing refactoring efforts.

### Quick Stats

| Category | Count | Impact |
|----------|-------|--------|
| Completed refactors | 4 | P1.1-P1.4 done |
| Pending high-priority | 8 | P2.1-P2.4, P3.1-P3.4 |
| New candidates identified | 6 | See Section 3 |
| Total files >500 lines | 12 | Critical complexity |
| API routes needing extraction | 58 | Systematic pattern |

---

## 1. Completed Refactors (Reference)

These have been completed per `REFACTORING_PLAN.md`:

| Task | File | Before | After | Reduction |
|------|------|--------|-------|-----------|
| P1.1 | `lib/db/schema.ts` | 1,113 lines | 16 lines (re-export) | 99% |
| P1.2 | `lib/ingestion/processor.ts` | 1,024 lines | 81 lines | 92% |
| P1.3 | `app/api/dashboard/social-links/route.ts` | 912 lines | 662 lines | 27% |
| P1.4 | `components/admin/AdminCreatorProfilesWithSidebar.tsx` | 902 lines | 725 lines | 20% |

---

## 2. Pending Refactors from REFACTORING_PLAN.md

### Priority 2 (High Priority - Recommended Next)

#### P2.1 - Extract Multi-Step Form Hook
- **File:** `components/dashboard/organisms/AppleStyleOnboardingForm.tsx` (788 lines)
- **Issue:** Duplicates multi-step logic, validation, error handling
- **Impact:** Enables reusable form infrastructure across 5+ components
- **Effort:** Medium

#### P2.2 - Refactor Main Sidebar Component
- **File:** `components/organisms/Sidebar.tsx` (785 lines)
- **Issue:** 20+ sub-components, mixed context/UI/mobile concerns
- **Impact:** Foundation for P2.3 (BaseSidebar)
- **Effort:** Medium

#### P2.3 - Create BaseSidebar Component
- **Scope:** 7 sidebar components with duplicate patterns
- **Issue:** Duplicate open/close state, keyboard handling, animations
- **Impact:** Reduces 1,500+ lines across sidebars to shared base
- **Effort:** Medium

#### P2.4 - Refactor Stripe Customer Sync
- **File:** `lib/stripe/customer-sync.ts` (1,203 lines)
- **Issue:** Billing queries, sync, locking, logging all mixed
- **Impact:** Critical billing path - improves testability
- **Effort:** Medium

### Priority 3 (Medium Priority)

#### P3.1 - Consolidate Ingestion Strategies
- **Files:** `base.ts` (734 lines), `beacons.ts` (573 lines), `linktree.ts` (471 lines)
- **Issue:** URL validation, HTML parsing duplicated
- **Effort:** Medium

#### P3.2 - Consolidate Stripe Webhook Handlers
- **Files:** 4 handler files (286-387 lines each)
- **Issue:** Customer ID extraction, cache invalidation duplicated
- **Effort:** Small

#### P3.3 - Extract Dashboard Table Components
- **Scope:** Multiple table components with duplicate logic
- **Issue:** Sorting, pagination, row selection patterns repeated
- **Effort:** Medium

#### P3.4 - Modularize API Routes
- **Files:** `waitlist/route.ts` (484 lines), `track/route.ts` (366 lines)
- **Issue:** Business logic embedded in routes
- **Effort:** Medium

---

## 3. NEW Candidates Identified

These are new refactoring opportunities not yet in `REFACTORING_PLAN.md`:

### 3.1 Database Client Modularization (HIGH)
- **File:** `lib/db/index.ts` (715 lines)
- **Issue:** Database init, retry, health checks, cleanup all mixed
- **Recommended Split:**
  ```
  lib/db/
  ├── client.ts       # Connection & initialization
  ├── health.ts       # Health check functions
  ├── helpers.ts      # withDb, withTransaction wrappers
  ├── retry.ts        # Retry logic
  └── index.ts        # Re-exports
  ```
- **Effort:** Small-Medium

### 3.2 Sentry Initialization Cleanup (MEDIUM)
- **File:** `lib/sentry/init.ts` (739 lines)
- **Issue:** 50%+ comments, duplicates route-detector.ts
- **Action:** Move docs to separate file, consolidate route detection
- **Effort:** Small

### 3.3 useFormState Hook Documentation (LOW)
- **File:** `lib/hooks/useFormState.ts` (677 lines)
- **Issue:** 400+ lines of JSDoc comments
- **Action:** Extract docs to Storybook/separate docs file
- **Effort:** Small

### 3.4 API Route Error Handling Pattern (HIGH)
- **Scope:** 58 API route files
- **Issue:** 191 try/catch blocks with similar patterns, 338 NextResponse.json calls
- **Recommended Solution:**
  ```typescript
  // lib/api/middleware.ts
  export function withErrorHandler(handler: Handler) {
    return async (req: NextRequest) => {
      try {
        return await handler(req);
      } catch (error) {
        return createErrorResponse(error);
      }
    };
  }
  ```
- **Impact:** Reduces 1,000+ lines of duplicate error handling
- **Effort:** Medium

### 3.5 ContactSidebar Decomposition (MEDIUM)
- **File:** `components/organisms/ContactSidebar.tsx` (590 lines)
- **Issue:** Form state, validation, submission, UI all mixed
- **Recommended Split:**
  ```
  components/organisms/ContactSidebar/
  ├── index.tsx
  ├── ContactForm.tsx
  ├── ContactFormFields.tsx
  ├── useContactForm.ts
  └── types.ts
  ```
- **Effort:** Medium

### 3.6 AccountSettingsSection Cleanup (MEDIUM)
- **File:** `components/dashboard/organisms/AccountSettingsSection.tsx` (552 lines)
- **Issue:** Tab-based component with inline form logic
- **Action:** Extract each settings tab to separate component
- **Effort:** Medium

---

## 4. Prioritized Action Plan

Based on impact, dependencies, and effort:

### Phase 1: Quick Wins (Low effort, high impact)

1. **P3.2 - Stripe Webhook Handlers** - Small effort, reduces duplication
2. **3.2 - Sentry Init Cleanup** - Move comments, consolidate route detection
3. **3.3 - useFormState Docs** - Extract documentation

### Phase 2: Foundation Work

4. **P2.4 - Stripe Customer Sync** (1,203 lines) - Critical billing path
5. **3.1 - Database Client** (715 lines) - Core infrastructure
6. **P2.2 - Main Sidebar** (785 lines) - Enables P2.3

### Phase 3: Pattern Standardization

7. **3.4 - API Error Handling Pattern** - Affects 58 files
8. **P2.1 - Multi-Step Form Hook** - Enables form standardization
9. **P2.3 - BaseSidebar Component** - Reduces 7 sidebars

### Phase 4: Feature Components

10. **P3.1 - Ingestion Strategies** - Large but isolated
11. **3.5 - ContactSidebar** - Medium complexity
12. **3.6 - AccountSettingsSection** - Medium complexity

---

## 5. Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Files >500 lines | 12 | 0 |
| Files >300 lines | 28+ | <10 |
| API routes with inline business logic | 58 | 0 |
| Duplicate error handling patterns | 191 | 1 (centralized) |
| Components per file | Up to 20 | 1 |

---

## 6. Recommendations

### Immediate Actions

1. **Add P3.2 and new candidates (3.1-3.6) to `REFACTORING_PLAN.md`** - Formalize these tasks
2. **Start with Phase 1 quick wins** - Low risk, visible improvements
3. **Tackle P2.4 (Stripe Customer Sync)** - Highest line count remaining

### Process Improvements

1. **Enforce component size limits** - CI check for files >300 lines
2. **Create API middleware pattern** - Template for new routes
3. **Document extracted patterns** - Ensure consistency

### Technical Debt Tracking

- Current TODO/FIXME markers: 3 (low - good hygiene)
- Files violating single-responsibility: ~12
- Estimated total refactoring effort: 3-4 weeks focused work

---

## Appendix: File Size Analysis

### Files >700 lines (Critical)

| File | Lines | Category |
|------|-------|----------|
| `lib/stripe/customer-sync.ts` | 1,203 | Service |
| `components/organisms/Sidebar.tsx` | 785 | Component |
| `components/dashboard/organisms/AppleStyleOnboardingForm.tsx` | 788 | Component |
| `lib/sentry/init.ts` | 739 | Config |
| `lib/ingestion/strategies/base.ts` | 734 | Service |
| `lib/db/index.ts` | 715 | Infrastructure |
| `lib/hooks/useFormState.ts` | 677 | Hook |

### Files 500-700 lines (High Priority)

| File | Lines | Category |
|------|-------|----------|
| `components/admin/AdminCreatorProfilesWithSidebar.tsx` | 725 | Component |
| `app/api/dashboard/social-links/route.ts` | 662 | API |
| `components/organisms/ContactSidebar.tsx` | 590 | Component |
| `lib/ingestion/strategies/beacons.ts` | 573 | Service |
| `components/dashboard/organisms/AccountSettingsSection.tsx` | 552 | Component |

---

*This report should be updated as refactoring progresses. See `REFACTORING_PLAN.md` for task claiming and completion workflow.*
