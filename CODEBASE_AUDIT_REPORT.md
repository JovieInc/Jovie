# Codebase Improvement Audit Report

**Generated:** 2025-12-27
**Repository:** Jovie (Next.js 16 Artist Profile Platform)
**Audit Focus:** Refactoring, Performance, Duplication, Unification

---

## 1. Executive Summary (Top 5 Wins)

| # | Improvement | Impact | Effort | Expected Benefit |
|---|-------------|--------|--------|------------------|
| **1** | **Consolidate API Response/Error Handling** | High | M | Eliminate 47+ files with duplicate NO_STORE_HEADERS, standardize error responses across 51 API routes |
| **2** | **Unify Rate Limiting** | High | S | Remove 4 separate implementations, single Redis-backed system with graceful degradation |
| **3** | **Extract EnhancedDashboardLinks Component** | High | L | Decompose 1,321-line god component into 5-6 focused modules, improve maintainability |
| **4** | **Consolidate Feature Flag Systems** | High | M | Remove 3 separate flag implementations (`/lib/feature-flags.ts`, `/lib/flags/`, `/lib/analytics.ts`), use Statsig only |
| **5** | **Fix N+1 Link Conversions** | High | S | Eliminate duplicate `buildPlatformMeta()` calls (2x per link on every change), ~50-100ms savings |

---

## 2. Prioritized Backlog (Ranked)

### 2.1 [CRITICAL] Standardize API Route Infrastructure

**Title:** Create Unified API Route Utilities
**Impact:** High | **Effort:** M | **Category:** Unification / Duplication

**Where:**
- 47+ files with `const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;`
- 51 API routes with try-catch blocks
- 10+ routes with repeated auth checks
- 5 cron routes with duplicate Bearer token verification

**Symptoms:**
```typescript
// Pattern repeated in 47+ files
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Pattern repeated in 10+ files
const { userId } = await auth();
if (!userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
}

// Pattern repeated in 5 cron files
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Fix Plan:**
1. Create `/lib/api/constants.ts` with `NO_STORE_HEADERS`, common status codes
2. Create `/lib/api/responses.ts` with typed response builders:
   - `successResponse<T>(data: T, options?)`
   - `errorResponse(code: ErrorCode, message: string, options?)`
3. Create `/lib/api/middleware.ts` with decorators:
   - `withAuth()` - Clerk auth check
   - `withCronAuth()` - Bearer token verification
   - `withRateLimit(limiter)` - Rate limiting
   - `withErrorHandling()` - Sentry capture
4. Migrate routes incrementally, starting with cron routes

**Acceptance Criteria:**
- [ ] NO_STORE_HEADERS defined in exactly 1 file
- [ ] All API routes return consistent response shape: `{ success, data?, error?, code? }`
- [ ] Auth checks use middleware, not inline code
- [ ] Error responses include structured codes

**Tests/Verification:**
- Unit tests for response builders
- Integration tests for middleware
- Snapshot tests for response shapes

**Risk:** Low - purely additive, routes migrate incrementally

---

### 2.2 [CRITICAL] Decompose EnhancedDashboardLinks Component

**Title:** Break Down 1,321-Line God Component
**Impact:** High | **Effort:** L | **Category:** Refactor

**Where:**
- `/apps/web/components/dashboard/organisms/EnhancedDashboardLinks.tsx` (1,321 lines)

**Symptoms:**
- 20+ useState hooks
- 15+ useCallback hooks
- 8+ useEffect hooks
- Mixed concerns: profile editing, link management, suggestions, avatar upload, polling

**Fix Plan:**
1. Extract **ProfileHeader** component (lines 1171-1299):
   - Avatar upload handling
   - Display name/username editing
   - Profile save status
2. Extract **useProfileEditor** hook:
   - `profileDisplayName`, `profileUsername` state
   - `saveProfile`, `debouncedProfileSave` logic
   - `handleAvatarUpload`, `handleAvatarUpdate`
3. Extract **useLinkManager** hook:
   - `links`, `suggestedLinks` state
   - `persistLinks`, `enqueueSave`, `debouncedSave`
   - `handleManagerLinksChange`
4. Extract **useSuggestionSync** hook:
   - Polling coordinator integration
   - `syncSuggestionsFromServer`
   - Auto-refresh logic
5. Extract **link conversion utilities** to `/lib/links/conversions.ts`:
   - `buildPlatformMeta`
   - `convertDbLinkToDetected`
   - `convertDbLinksToLinkItems`
   - `convertDbLinksToSuggestions`
6. Main component becomes ~200-300 lines, composing extracted pieces

**Acceptance Criteria:**
- [ ] EnhancedDashboardLinks < 400 lines
- [ ] Each extracted module < 300 lines
- [ ] No prop drilling beyond 2 levels
- [ ] All existing tests pass

**Tests/Verification:**
- Existing unit tests continue passing
- Add unit tests for each extracted hook
- E2E test for dashboard link management flow

**Risk:** Medium - requires careful refactoring to preserve behavior
**Mitigation:** Feature flag new implementation, A/B test before full rollout

---

### 2.3 [HIGH] Consolidate Rate Limiting

**Title:** Unify 4 Rate Limiting Implementations
**Impact:** High | **Effort:** S | **Category:** Unification

**Where:**
- `/lib/rate-limit.ts` - Upstash Redis (5 separate limiters)
- `/lib/utils/rate-limit.ts` - In-memory Map-based
- `/lib/onboarding/rate-limit.ts` - Hybrid with fallback
- `/lib/analytics/tracking-rate-limit.ts` - Analytics-specific

**Symptoms:**
- Inconsistent rate limiting across endpoints
- Some use Redis, some use in-memory
- Manual fallback logic in onboarding
- Different configurations per endpoint type

**Fix Plan:**
1. Consolidate into single `/lib/rate-limit/index.ts`:
   ```typescript
   export const rateLimiters = {
     api: createLimiter({ requests: 60, window: '1m' }),
     upload: createLimiter({ requests: 10, window: '1m' }),
     onboarding: createLimiter({ requests: 5, window: '1m' }),
     tracking: createLimiter({ requests: 100, window: '1m' }),
   };
   ```
2. Implement automatic fallback: Redis primary → in-memory fallback
3. Create `withRateLimit(limiter)` middleware
4. Remove duplicate implementations
5. Update all API routes to use new system

**Acceptance Criteria:**
- [ ] Single rate limiting module
- [ ] Automatic Redis → in-memory fallback
- [ ] Consistent rate limit headers in responses
- [ ] All endpoints use centralized system

**Tests/Verification:**
- Unit tests for fallback behavior
- Load tests to verify limits
- Integration tests for header presence

**Risk:** Low - well-isolated change

---

### 2.4 [HIGH] Consolidate Feature Flag Systems

**Title:** Remove Legacy Feature Flag Implementations
**Impact:** High | **Effort:** M | **Category:** Unification

**Where:**
- `/lib/feature-flags.ts` - Legacy manual implementation
- `/lib/flags/` - Statsig-based (preferred)
- `/lib/analytics.ts` - Duplicate `FEATURE_FLAGS` object

**Symptoms:**
- 3 different ways to check feature flags
- Duplicate flag constant definitions
- Inconsistent flag checking APIs
- Legacy `/api/feature-flags` endpoint unused

**Fix Plan:**
1. Audit all flag usages across codebase
2. Migrate all flags to `/lib/flags/flags.ts`
3. Update all imports to use `STATSIG_FLAGS`
4. Remove `/lib/feature-flags.ts`
5. Remove `FEATURE_FLAGS` from `/lib/analytics.ts`
6. Delete `/api/feature-flags` endpoint if unused

**Acceptance Criteria:**
- [ ] Single source of truth for all feature flags
- [ ] No imports from `/lib/feature-flags.ts`
- [ ] Type-safe flag names via `StatsigFlagName`
- [ ] Consistent server/client flag checking APIs

**Tests/Verification:**
- Grep for legacy imports
- Type checking catches invalid flag names
- Manual flag testing in preview environment

**Risk:** Medium - requires careful migration
**Mitigation:** Keep legacy system during migration, remove after verification

---

### 2.5 [HIGH] Fix N+1 Link Conversion Pattern

**Title:** Cache Link Platform Metadata Conversions
**Impact:** High | **Effort:** S | **Category:** Performance

**Where:**
- `/apps/web/components/dashboard/organisms/EnhancedDashboardLinks.tsx` (lines 500-597)

**Symptoms:**
```typescript
// buildPlatformMeta called 2x per link on every change
const convertDbLinksToLinkItems = useCallback((dbLinks) => {
  return dbLinks.map((link, index) => {
    const detected = convertDbLinkToDetected(link); // calls buildPlatformMeta
    const platformMeta = buildPlatformMeta(link);   // calls buildPlatformMeta AGAIN
    // ...
  });
}, [buildPlatformMeta, convertDbLinkToDetected]);
```

**Fix Plan:**
1. Merge `convertDbLinkToDetected` and `buildPlatformMeta` into single function
2. Add memoization cache for platform metadata:
   ```typescript
   const platformMetaCache = useRef(new Map<string, Platform>());
   const getCachedPlatformMeta = useCallback((link) => {
     const key = `${link.platform}:${link.platformType}`;
     if (!platformMetaCache.current.has(key)) {
       platformMetaCache.current.set(key, buildPlatformMeta(link));
     }
     return platformMetaCache.current.get(key);
   }, []);
   ```
3. Clear cache on profile change

**Acceptance Criteria:**
- [ ] `buildPlatformMeta` called exactly once per unique platform
- [ ] Link conversion ~50% faster on 20+ link profiles
- [ ] No functional changes to link display

**Tests/Verification:**
- Performance profiling before/after
- Unit tests for cache behavior
- E2E tests for link management

**Risk:** Low - isolated optimization

---

### 2.6 [HIGH] Standardize Validation Patterns

**Title:** Consolidate Validation to Zod Schemas
**Impact:** Medium | **Effort:** M | **Category:** Unification / Duplication

**Where:**
- `/lib/validation/username.ts` - Manual validation (136 reserved words)
- `/lib/validation/client-username.ts` - Duplicate validation (29 reserved words)
- `/lib/validation/onboarding.ts` - Zod schema
- `/lib/contacts/validation.ts` - Email/phone validation
- `/lib/notifications/validation.ts` - Duplicate email/phone validation

**Symptoms:**
- Reserved words list inconsistency (136 vs 29 entries)
- Different validation result structures
- Duplicate email regex patterns
- Duplicate phone normalization logic

**Fix Plan:**
1. Create `/lib/validation/schemas/` directory
2. Convert username validation to Zod schema with full reserved words
3. Create shared email/phone validation schemas
4. Export isomorphic schemas for client/server use
5. Remove duplicate validation files
6. Update all validation call sites

**Acceptance Criteria:**
- [ ] Single reserved words list (136+ entries)
- [ ] All validation uses Zod schemas
- [ ] Type inference from schemas (`z.infer<typeof schema>`)
- [ ] Consistent error message format

**Tests/Verification:**
- Unit tests for all validation scenarios
- Property-based tests for edge cases
- Client/server parity tests

**Risk:** Medium - validation changes can break forms
**Mitigation:** Parallel run old/new validation, compare results

---

### 2.7 [MEDIUM] Add React.memo to Expensive Components

**Title:** Wrap Table and List Components with React.memo
**Impact:** Medium | **Effort:** S | **Category:** Performance

**Where:**
- `/components/dashboard/organisms/DashboardAudienceTable.tsx` - 10+ props, no memoization
- `/components/dashboard/organisms/SettingsPolished.tsx` - Inline sections array

**Symptoms:**
```typescript
// DashboardAudienceTable re-renders on any parent change
export function DashboardAudienceTable({
  mode, rows, total, page, pageSize, // ... 5+ more props
}) { ... }

// SettingsPolished creates new sections array every render
const sections = [
  { id: 'profile', title: 'Profile', render: renderProfileSection },
  // ... 6 more sections
];
```

**Fix Plan:**
1. Wrap `DashboardAudienceTable` with `React.memo`:
   ```typescript
   export const DashboardAudienceTable = memo(function DashboardAudienceTable({...}) {
     // ...
   }, (prev, next) => {
     return prev.rows === next.rows && prev.page === next.page && ...;
   });
   ```
2. Move `sections` array to `useMemo` in SettingsPolished
3. Extract theme options to constant
4. Audit other large components for memoization opportunities

**Acceptance Criteria:**
- [ ] DashboardAudienceTable wrapped with memo + custom equality
- [ ] SettingsPolished sections memoized
- [ ] No unnecessary re-renders in React DevTools profiler

**Tests/Verification:**
- React DevTools profiler comparison
- Performance metrics in Lighthouse
- No functional regressions

**Risk:** Low - purely performance optimization

---

### 2.8 [MEDIUM] Replace Console Logging with Structured Logger

**Title:** Migrate 1,083 Console Calls to Logger
**Impact:** Medium | **Effort:** M | **Category:** Unification

**Where:**
- 1,083 direct `console.log/error/warn` calls across codebase
- `/lib/utils/logger.ts` - Existing structured logger (underutilized)

**Symptoms:**
- Mix of console and logger usage
- Inconsistent log formats
- No structured metadata
- Can't disable logging per environment

**Fix Plan:**
1. Add ESLint rule to disallow direct console calls
2. Create codemod to convert console calls:
   ```typescript
   // Before
   console.error('Failed to fetch', error);
   // After
   logger.error('Failed to fetch', { error });
   ```
3. Run codemod across codebase
4. Review and adjust log levels
5. Add structured JSON output for production

**Acceptance Criteria:**
- [ ] Zero direct console calls in src/
- [ ] ESLint error on new console usage
- [ ] All logs include structured context
- [ ] Log levels configurable per environment

**Tests/Verification:**
- ESLint passes
- Log output verification in tests
- Production log analysis

**Risk:** Low - non-functional change
**Mitigation:** Run in batches, review each batch

---

### 2.9 [MEDIUM] Decompose SettingsPolished Component

**Title:** Extract Settings Sections into Separate Components
**Impact:** Medium | **Effort:** M | **Category:** Refactor

**Where:**
- `/apps/web/components/dashboard/organisms/SettingsPolished.tsx` (996 lines)

**Symptoms:**
- 7 inline render functions (`renderProfileSection`, `renderAppearanceSection`, etc.)
- 10+ useState hooks
- Mixed concerns: profile, appearance, branding, notifications, billing, pixels

**Fix Plan:**
1. Extract each section to separate component:
   - `ProfileSettingsSection`
   - `AppearanceSettingsSection`
   - `BrandingSettingsSection`
   - `NotificationSettingsSection`
   - `BillingSettingsSection`
   - `PixelSettingsSection`
   - `AccountSettingsSection`
2. Create shared `SettingsSectionProps` interface
3. Extract common hooks to `useSettingsForm`
4. Main component becomes section orchestrator (~200 lines)

**Acceptance Criteria:**
- [ ] SettingsPolished < 300 lines
- [ ] Each section < 200 lines
- [ ] Consistent section API
- [ ] Lazy load non-visible sections

**Tests/Verification:**
- Existing E2E tests pass
- Unit tests for each section
- Visual regression tests

**Risk:** Medium - UI changes require careful testing

---

### 2.10 [LOW] Consolidate Device Detection Logic

**Title:** Centralize User Agent Parsing
**Impact:** Low | **Effort:** S | **Category:** Duplication

**Where:**
- `/app/api/audience/visit/route.ts` (lines 43-53)
- `/app/api/track/route.ts` (lines 57-67)
- `/lib/utils/platform-detection/` - Existing detection utilities

**Symptoms:**
```typescript
// Duplicate function in 3 files
function inferDeviceType(userAgent: string | null): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) return 'mobile';
  return 'desktop';
}
```

**Fix Plan:**
1. Add `inferDeviceType` to `/lib/utils/platform-detection/device.ts`
2. Export from `/lib/utils/platform-detection/index.ts`
3. Remove duplicate implementations
4. Update imports in API routes

**Acceptance Criteria:**
- [ ] Single device detection implementation
- [ ] Consistent device type results
- [ ] No duplicate code

**Tests/Verification:**
- Unit tests for device detection
- Snapshot tests for various user agents

**Risk:** Low - simple extraction

---

## 3. Unification Opportunities (Make 1 Way the Default)

| Pattern | Current State | Recommended Default | Migration Effort |
|---------|--------------|---------------------|------------------|
| **Feature Flags** | 3 systems (legacy, Statsig, analytics) | Statsig (`/lib/flags/`) | Medium |
| **Rate Limiting** | 4 implementations | Upstash Redis with fallback | Small |
| **Validation** | Manual + Zod mixed | Zod everywhere | Medium |
| **Error Handling** | Inline try-catch | Centralized middleware | Medium |
| **Auth Checks** | Scattered inline | Middleware decorators | Medium |
| **Logging** | Console + logger mix | Structured logger only | Medium |
| **API Responses** | Inconsistent shapes | `{success, data?, error?, code?}` | Medium |
| **Form Handling** | Native + useFormState mix | `useFormState` hook | Small |
| **Caching** | Mixed patterns | Centralized cache keys | Small |

### 3.1 Feature Flags - Use Statsig Only

**Current implementations:**
- `/lib/feature-flags.ts` - Legacy fetch-based
- `/lib/flags/` - Statsig (recommended)
- `/lib/analytics.ts` - Duplicate FEATURE_FLAGS

**Why Statsig is superior:**
- Type-safe flag names
- Server/client separation
- Centralized definitions
- Experiment support
- Session replay integration

**Migration steps:**
1. List all flags from all sources
2. Define all in `/lib/flags/flags.ts`
3. Update all imports
4. Remove legacy files

### 3.2 Validation - Use Zod Everywhere

**Current implementations:**
- Manual validation functions with custom result types
- Zod schemas (onboarding)
- Duplicate client/server validation

**Why Zod is superior:**
- Type inference
- Composable schemas
- Consistent error format
- Works on client and server
- Built-in transformations

**Migration steps:**
1. Convert username validation to Zod
2. Merge reserved words lists
3. Create shared email/phone schemas
4. Export isomorphic schemas

### 3.3 Error Responses - Standardize Shape

**Current patterns:**
- `{ error: 'message' }`
- `{ success: false, error: 'message', code: 'error_code' }`
- `{ error: 'message', details: object }`

**Standard shape:**
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: ErrorCode;
}
```

**Migration steps:**
1. Define response types
2. Create response builder utilities
3. Migrate routes incrementally
4. Add TypeScript strict checking

---

## 4. Redundant API Calls & Duplicated Logic Inventory

### 4.1 Profile Fetching
**Occurrences:** 40 fetch calls to `/api/` endpoints in components
**Files:** `/components/dashboard/organisms/EnhancedDashboardLinks.tsx`, `/components/dashboard/organisms/SettingsPolished.tsx` (7 calls each)
**Recommendation:** Consolidate into server actions or dedicated hooks

### 4.2 Error Handling
**Occurrences:** 99 try-catch blocks in API routes
**Pattern:** Similar error logging and response formatting
**Recommendation:** Centralized error handler middleware

### 4.3 Cache Headers
**Occurrences:** 47 files with `NO_STORE_HEADERS`
**Recommendation:** Single export from `/lib/api/constants.ts`

### 4.4 Auth Checks
**Occurrences:** 10+ routes with inline Clerk auth
**Pattern:** `const { userId } = await auth(); if (!userId) return 401;`
**Recommendation:** `withAuth()` middleware decorator

### 4.5 Cron Authorization
**Occurrences:** 5 cron routes
**Pattern:** Bearer token verification
**Recommendation:** `withCronAuth()` middleware

### 4.6 Email/Phone Validation
**Occurrences:** 2 files with duplicate logic
**Files:** `/lib/contacts/validation.ts`, `/lib/notifications/validation.ts`
**Recommendation:** Single validation module at `/lib/validation/contact.ts`

### 4.7 Device Detection
**Occurrences:** 3 files
**Recommendation:** Single function in platform-detection module

### 4.8 Action Labels/Icons
**Occurrences:** 3 files with duplicate dictionaries
**Recommendation:** Single export from `/lib/constants/actions.ts`

---

## 5. Quick Wins vs Long-Term Refactors

### Quick Wins (< 1 day each)

| Task | Files Affected | Effort | Dependencies |
|------|----------------|--------|--------------|
| Extract NO_STORE_HEADERS | 47 files | 2h | None |
| Consolidate device detection | 3 files | 1h | None |
| Extract action labels/icons | 3 files | 1h | None |
| Add React.memo to DashboardAudienceTable | 1 file | 2h | None |
| Memoize SettingsPolished sections | 1 file | 2h | None |
| Fix N+1 buildPlatformMeta calls | 1 file | 3h | None |
| Merge email validation | 2 files | 2h | None |
| Merge phone validation | 2 files | 2h | None |

### Medium Term (2-5 days each)

| Task | Files Affected | Effort | Dependencies |
|------|----------------|--------|--------------|
| Create API response utilities | ~51 routes | 3 days | Quick wins |
| Consolidate rate limiting | 4 modules, ~10 routes | 2 days | None |
| Consolidate feature flags | ~20 files | 3 days | None |
| Migrate console → logger | 1,083 calls | 4 days | None |
| Standardize validation to Zod | ~10 files | 3 days | None |
| Create auth middleware | ~15 routes | 3 days | API utilities |

### Long-Term (> 1 week)

| Task | Files Affected | Effort | Dependencies |
|------|----------------|--------|--------------|
| Decompose EnhancedDashboardLinks | 1 → 6 files | 1.5 weeks | None |
| Decompose SettingsPolished | 1 → 8 files | 1 week | None |
| Migrate all API routes to middleware | 51 routes | 2 weeks | API utilities, auth middleware |
| Full error handling unification | All API routes | 2 weeks | API utilities |

### Dependency Graph

```
Quick Wins (parallel)
    ↓
API Response Utilities ←→ Auth Middleware
    ↓                          ↓
Rate Limiting Consolidation    Cron Auth
    ↓
Feature Flag Consolidation
    ↓
Component Decomposition (EnhancedDashboardLinks, SettingsPolished)
    ↓
Full API Route Migration
```

---

## 6. Implementation Recommendations

### Phase 1: Foundation (Weeks 1-2)
1. Complete all quick wins
2. Create API utilities module
3. Consolidate rate limiting

### Phase 2: Unification (Weeks 3-4)
1. Consolidate feature flags
2. Create auth middleware
3. Start console → logger migration

### Phase 3: Refactoring (Weeks 5-8)
1. Decompose EnhancedDashboardLinks
2. Decompose SettingsPolished
3. Complete validation consolidation

### Phase 4: Full Migration (Weeks 9-12)
1. Migrate all API routes to new patterns
2. Complete error handling unification
3. Remove all legacy code

---

## 7. Risk Assessment

| Change | Risk Level | Mitigation |
|--------|------------|------------|
| API response format | Medium | Version API, support both formats during migration |
| Component decomposition | Medium | Feature flag new implementation, A/B test |
| Feature flag consolidation | Medium | Parallel run, compare results |
| Validation changes | Medium | Run old/new in parallel, compare |
| Rate limiting | Low | Automatic fallback built-in |
| Logger migration | Low | Non-functional change |
| Memoization | Low | Pure performance, no behavior change |

---

## Appendix A: Largest Files Requiring Attention

| File | Lines | Recommendation |
|------|-------|----------------|
| `EnhancedDashboardLinks.tsx` | 1,321 | Decompose into 5-6 modules |
| `schema.ts` (DB) | 1,058 | Acceptable - single source of truth |
| `processor.ts` (Ingestion) | 1,023 | Well-structured, no action needed |
| `SettingsPolished.tsx` | 996 | Extract section components |
| `social-links/route.ts` | 911 | Consider splitting GET/PUT/PATCH |
| `AdminCreatorProfilesWithSidebar.tsx` | 896 | Extract sidebar logic |
| `platforms.ts` | 872 | Acceptable - canonical registry |

---

## Appendix B: Files with Most Duplication

| Pattern | File Count | Example Files |
|---------|------------|---------------|
| NO_STORE_HEADERS | 47 | All API routes |
| Auth check | 10+ | billing/status, stripe/checkout, stripe/portal |
| Rate limit check | 5 | notifications/subscribe, notifications/unsubscribe |
| Cron auth | 5 | cron/cleanup-*, cron/billing-*, cron/waitlist-* |
| Error response | 51 | All API routes |
| Zod safeParse | 15+ | API routes with body validation |
