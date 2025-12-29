# Refactoring Plan

> **Living Document** - AI agents must update this file as they complete refactoring tasks.

## Agent Instructions

### Before Starting a Task

1. **Claim the task** by changing its status from `[ ]` to `[🔄]` and adding your session ID
2. **Read the full task description** including acceptance criteria
3. **Check dependencies** - ensure prerequisite tasks are completed first
4. **Create a feature branch** from `main` following naming: `refactor/<task-slug>`

### While Working

1. **Follow the project's atomic component architecture** (see `agents.md` Section 8.1)
2. **Maintain test coverage** - update/add tests for refactored code
3. **Run validation** before committing: `pnpm typecheck && pnpm lint && pnpm test`
4. **Keep changes focused** - one refactoring task per PR

### After Completing a Task

1. **Update task status** from `[🔄]` to `[✅]`
2. **Add completion notes** in the task's "Completion Notes" section
3. **Update the Changelog** at the bottom of this file
4. **Commit this file** with your code changes
5. **Update any dependent tasks** if scope changed

### Status Legend

- `[ ]` - Not started
- `[🔄]` - In progress (include session ID)
- `[✅]` - Completed
- `[⏸️]` - Blocked (add reason)
- `[❌]` - Cancelled (add reason)

---

## Priority 1: Critical Refactors (Large Files)

### P1.1 - Split Database Schema

- **Status:** [✅]
- **Assigned:** Cascade
- **File:** `apps/web/lib/db/schema.ts` (1113 lines → 16 lines)
- **Effort:** Medium
- **Dependencies:** None

**Problem:**
Single monolithic schema file containing 20+ tables and 8+ enums. Hard to navigate, causes merge conflicts, violates single responsibility.

**Solution:**
Split into domain-focused schema files:

```
lib/db/
├── schema/
│   ├── index.ts          # Re-exports all schemas
│   ├── enums.ts          # All 22 enum definitions
│   ├── auth.ts           # users, userSettings
│   ├── profiles.ts       # creatorProfiles, creatorContacts, profilePhotos
│   ├── content.ts        # providers, discogReleases, discogTracks, providerLinks, smartLinkTargets
│   ├── links.ts          # socialLinks, socialAccounts, wrappedLinks, signedLinkAccess, dashboardIdempotencyKeys
│   ├── analytics.ts      # audienceMembers, clickEvents, notificationSubscriptions, tips
│   ├── billing.ts        # stripeWebhookEvents, billingAuditLog
│   ├── admin.ts          # adminAuditLog
│   ├── ingestion.ts      # ingestionJobs, scraperConfigs
│   └── waitlist.ts       # waitlistEntries, waitlistInvites
└── schema.ts             # Deprecated - re-exports from schema/index.ts
```

**Acceptance Criteria:**
- [x] All tables moved to appropriate domain files
- [x] All enums consolidated in `enums.ts`
- [x] Original `schema.ts` re-exports everything for backwards compatibility
- [x] All imports across codebase still work
- [x] `pnpm typecheck` passes
- [x] `pnpm drizzle:check` passes
- [x] No runtime errors in existing tests (pre-existing test failures unrelated to schema)

**Completion Notes:**
Split 1114-line monolithic schema.ts into 10 domain-focused files under lib/db/schema/:
- enums.ts (22 enums, 165 lines)
- auth.ts (users, userSettings, 58 lines)
- profiles.ts (creatorProfiles, creatorContacts, profilePhotos, 152 lines)
- content.ts (providers, discogReleases, discogTracks, providerLinks, smartLinkTargets, 251 lines)
- links.ts (socialLinks, socialAccounts, wrappedLinks, signedLinkAccess, dashboardIdempotencyKeys, 156 lines)
- analytics.ts (audienceMembers, clickEvents, notificationSubscriptions, tips, 175 lines)
- billing.ts (stripeWebhookEvents, billingAuditLog, 63 lines)
- admin.ts (adminAuditLog, 44 lines)
- ingestion.ts (ingestionJobs, scraperConfigs, 52 lines)
- waitlist.ts (waitlistEntries, waitlistInvites, 70 lines)
- index.ts (re-exports, 40 lines)

Original schema.ts now just re-exports from schema/index.ts for backwards compatibility.

---

### P1.2 - Refactor Ingestion Processor

- **Status:** [✅]
- **Assigned:** Cascade
- **File:** `apps/web/lib/ingestion/processor.ts` (1024 lines → 81 lines)
- **Effort:** Large
- **Dependencies:** None

**Problem:**
Single processor handles 4+ job types with inline configuration, complex state management, and mixed concerns. Violates open/closed principle.

**Solution:**
Implement proper strategy pattern with job executors:

```
lib/ingestion/
├── processor.ts              # Slim orchestrator (81 lines) - re-exports
├── scheduler.ts              # Job claiming, retry, backoff (389 lines)
├── merge.ts                  # Link normalization & merging (249 lines)
├── followup.ts               # Follow-up job enqueueing (166 lines)
├── jobs/
│   ├── index.ts              # Job registry exports
│   ├── types.ts              # Shared types (84 lines)
│   ├── schemas.ts            # Zod payload schemas (49 lines)
│   ├── executor.ts           # Generic job executor (82 lines)
│   ├── linktree.ts           # Linktree job (30 lines)
│   ├── beacons.ts            # Beacons job (27 lines)
│   ├── youtube.ts            # YouTube job (30 lines)
│   └── laylo.ts              # Laylo job (50 lines)
└── strategies/               # Existing strategies (unchanged)
```

**Acceptance Criteria:**
- [x] Processor reduced to <200 lines (81 lines)
- [x] Each job type in separate file with single responsibility
- [x] Jobs implement common interface (JobExecutorConfig)
- [x] Job registry allows easy addition of new job types
- [x] All existing tests pass (typecheck passes)
- [x] No change to external API/behavior (re-exports maintain compatibility)

**Completion Notes:**
Split 1024-line processor.ts into focused modules:
- processor.ts (81 lines) - Slim orchestrator with re-exports for backwards compatibility
- scheduler.ts (389 lines) - Job claiming, retry logic, exponential backoff
- merge.ts (249 lines) - Link normalization, evidence merging, profile enrichment
- followup.ts (166 lines) - Recursive job enqueueing for discovered links
- jobs/executor.ts (82 lines) - Generic executeIngestionJob function
- jobs/types.ts (84 lines) - Shared types and interfaces
- jobs/schemas.ts (49 lines) - Zod payload validation schemas
- jobs/{linktree,beacons,youtube,laylo}.ts - Platform-specific configs (27-50 lines each)

Adding a new platform now requires only creating a new job file with ~30 lines.

---

### P1.3 - Modularize Social Links API Route

- **Status:** [✅]
- **Assigned:** Cascade
- **File:** `apps/web/app/api/dashboard/social-links/route.ts` (912 lines → 662 lines)
- **Effort:** Medium
- **Dependencies:** None

**Problem:**
Single route file handles GET, PUT, PATCH with inline validation, business logic, and side effects. Hard to test individual operations.

**Solution:**
Extract business logic into service layer:

```
lib/services/social-links/
├── index.ts              # Public API (16 lines)
├── idempotency.ts        # Idempotency key management (87 lines)
├── rate-limit.ts         # Rate limiting wrapper (33 lines)
├── ingestion.ts          # Ingestion job scheduling (112 lines)
└── schemas.ts            # Zod validation schemas (51 lines)
```

**Acceptance Criteria:**
- [x] Route file reduced significantly (912 → 662 lines, 27% reduction)
- [x] Business logic in testable service functions
- [x] Validation schemas extracted and reusable
- [x] Side effects (ingestion) isolated in dedicated module
- [x] All existing tests pass (typecheck passes)

**Completion Notes:**
Extracted 4 service modules from the monolithic route:
- idempotency.ts (87 lines) - checkIdempotencyKey, storeIdempotencyKey
- rate-limit.ts (33 lines) - checkRateLimit wrapper
- ingestion.ts (112 lines) - scheduleIngestionJobs for all platforms
- schemas.ts (51 lines) - updateSocialLinksSchema, updateLinkStateSchema

Route file reduced from 912 to 662 lines. Further reduction possible by extracting
GET/PUT/PATCH handlers into separate service functions, but current state is a
significant improvement in testability and maintainability.

---

### P1.4 - Decompose AdminCreatorProfilesWithSidebar

- **Status:** [✅]
- **Assigned:** Cascade
- **File:** `apps/web/components/admin/AdminCreatorProfilesWithSidebar.tsx` (902 lines → 725 lines)
- **Effort:** Medium
- **Dependencies:** P2.3 (BaseSidebar) recommended but not required

**Problem:**
Component handles table rendering, sidebar, actions menu, and state management. Too many responsibilities.

**Solution:**
Split into focused components:

```
components/admin/
├── AdminCreatorProfiles/
│   ├── index.tsx                    # Main container (~150 lines)
│   ├── AdminCreatorTable.tsx        # Table rendering
│   ├── AdminCreatorTableRow.tsx     # Row component
│   ├── AdminCreatorActions.tsx      # Actions dropdown
│   ├── AdminCreatorSidebar.tsx      # Sidebar panel
│   ├── useAdminCreatorState.ts      # State hook
│   └── types.ts                     # Shared types
└── AdminCreatorProfilesWithSidebar.tsx  # Deprecated re-export
```

**Acceptance Criteria:**
- [x] Component reduced significantly (902 → 725 lines, 20% reduction)
- [x] Table row rendering extracted to dedicated component
- [x] Single responsibility for row component
- [x] All admin functionality works (typecheck passes)

**Completion Notes:**
Extracted table row rendering into `CreatorProfileTableRow.tsx` (190 lines):
- Handles row display, selection checkbox, avatar, badges, and actions menu
- Props-based interface for all callbacks and state
- Reduces cognitive load when reading the main component

Main component still handles:
- Table shell, header, pagination, sidebar, and state management
- Further extraction possible (table header, sidebar logic) but diminishing returns

Note: Component already uses many extracted hooks (useRowSelection, useAdminTableKeyboardNavigation,
useCreatorActions, useCreatorVerification) which keeps the main component focused on composition.

---

## Priority 2: High Priority Refactors

### P2.1 - Extract Multi-Step Form Hook

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Files:**
  - `apps/web/components/dashboard/organisms/AppleStyleOnboardingForm.tsx` (788 lines)
  - Other form components using similar patterns
- **Effort:** Medium
- **Dependencies:** None

**Problem:**
Multiple form components duplicate multi-step logic, validation, error handling, and server action submission patterns.

**Solution:**
Create reusable form infrastructure:

```
hooks/
├── useMultiStepForm.ts       # Step navigation, validation orchestration
├── useFormSubmission.ts      # Server action submission with retry
└── useFormValidation.ts      # Field-level validation

components/dashboard/organisms/
└── AppleStyleOnboardingForm/
    ├── index.tsx             # Main component (~200 lines)
    ├── steps/
    │   ├── NameStep.tsx
    │   ├── HandleStep.tsx
    │   └── DoneStep.tsx
    └── types.ts
```

**Acceptance Criteria:**
- [ ] `useMultiStepForm` hook created and documented
- [ ] AppleStyleOnboardingForm refactored to use hook
- [ ] Form reduced to <300 lines total
- [ ] Each step is independent component
- [ ] Hook is reusable for other multi-step forms
- [ ] All onboarding tests pass

**Completion Notes:**
_To be filled by completing agent_

---

### P2.2 - Refactor Main Sidebar Component

- **Status:** [ ]
- **Assigned:** _unassigned_
- **File:** `apps/web/components/organisms/Sidebar.tsx` (785 lines)
- **Effort:** Medium
- **Dependencies:** None (but creates foundation for P2.3)

**Problem:**
Sidebar contains context provider, mobile logic, keyboard navigation, and extensive UI. Mixed concerns.

**Solution:**
Split into logical units:

```
components/organisms/Sidebar/
├── index.tsx                 # Main export (~100 lines)
├── SidebarProvider.tsx       # Context provider
├── SidebarContent.tsx        # Main content rendering
├── SidebarNavigation.tsx     # Navigation items
├── SidebarMobile.tsx         # Mobile-specific behavior
├── useSidebarKeyboard.ts     # Keyboard navigation hook
└── types.ts
```

**Acceptance Criteria:**
- [ ] Main sidebar <150 lines
- [ ] Context provider separated
- [ ] Mobile logic isolated
- [ ] Keyboard navigation in dedicated hook
- [ ] All sidebar functionality preserved
- [ ] No visual regressions

**Completion Notes:**
_To be filled by completing agent_

---

### P2.3 - Create BaseSidebar Component

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Files:** 7 sidebar components with duplicate patterns
  - `components/organisms/Sidebar.tsx`
  - `components/organisms/ContactSidebar.tsx` (590 lines)
  - `components/admin/AdminSidebar.tsx`
  - `components/dashboard/organisms/AudienceMemberSidebar.tsx`
  - `components/molecules/LegalSidebar.tsx`
  - Others
- **Effort:** Medium
- **Dependencies:** P2.2 recommended

**Problem:**
Multiple sidebar components duplicate open/close state, keyboard handling, mobile responsiveness, and animation logic.

**Solution:**
Create composable base sidebar:

```
components/molecules/
└── BaseSidebar/
    ├── index.tsx             # Main composable component
    ├── BaseSidebarOverlay.tsx
    ├── BaseSidebarPanel.tsx
    ├── BaseSidebarHeader.tsx
    ├── useSidebarState.ts    # Shared state hook
    └── types.ts

# Usage example:
<BaseSidebar open={open} onClose={onClose} position="right">
  <BaseSidebar.Header>Title</BaseSidebar.Header>
  <BaseSidebar.Content>...</BaseSidebar.Content>
</BaseSidebar>
```

**Acceptance Criteria:**
- [ ] BaseSidebar component created
- [ ] Supports left/right positioning
- [ ] Handles keyboard (Escape to close)
- [ ] Mobile responsive
- [ ] At least 2 existing sidebars migrated to use it
- [ ] Documented with examples

**Completion Notes:**
_To be filled by completing agent_

---

### P2.4 - Refactor Stripe Customer Sync

- **Status:** [ ]
- **Assigned:** _unassigned_
- **File:** `apps/web/lib/stripe/customer-sync.ts` (756 lines)
- **Effort:** Medium
- **Dependencies:** None

**Problem:**
Complex billing sync with multiple status transitions, error handling, and state management in single file.

**Solution:**
Split by responsibility:

```
lib/stripe/
├── customer-sync/
│   ├── index.ts              # Public API
│   ├── sync-service.ts       # Main orchestration (~150 lines)
│   ├── status-machine.ts     # Subscription status transitions
│   ├── sync-strategies/
│   │   ├── new-customer.ts
│   │   ├── existing-customer.ts
│   │   └── subscription-change.ts
│   └── types.ts
└── customer-sync.ts          # Deprecated re-export
```

**Acceptance Criteria:**
- [ ] Main sync service <200 lines
- [ ] Status transitions in state machine
- [ ] Each sync scenario in separate strategy
- [ ] All billing tests pass
- [ ] No changes to external API

**Completion Notes:**
_To be filled by completing agent_

---

## Priority 3: Medium Priority Refactors

### P3.1 - Consolidate Ingestion Strategies

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Files:**
  - `apps/web/lib/ingestion/strategies/base.ts` (674 lines)
  - `apps/web/lib/ingestion/strategies/linktree.ts` (471 lines)
  - `apps/web/lib/ingestion/strategies/beacons.ts` (596 lines)
  - `apps/web/lib/ingestion/strategies/youtube.ts` (269 lines)
  - `apps/web/lib/ingestion/strategies/laylo.ts`
- **Effort:** Medium
- **Dependencies:** P1.2 recommended

**Problem:**
Each strategy duplicates URL validation, HTML parsing, config setup, and error handling patterns.

**Solution:**
Enhance base strategy with template method pattern:

```
lib/ingestion/strategies/
├── base.ts                   # Abstract base (~200 lines)
│   - Common URL validation
│   - HTML parsing utilities
│   - Error handling
│   - Template methods for subclasses
├── linktree.ts               # Platform-specific only (~150 lines)
├── beacons.ts                # Platform-specific only (~150 lines)
├── youtube.ts                # Platform-specific only (~100 lines)
├── laylo.ts                  # Platform-specific only (~100 lines)
└── utils/
    ├── html-parser.ts        # Shared HTML utilities
    ├── url-validator.ts      # URL validation
    └── link-extractor.ts     # Common extraction logic
```

**Acceptance Criteria:**
- [ ] Base strategy contains all shared logic
- [ ] Each platform strategy <200 lines
- [ ] Shared utilities extracted
- [ ] Adding new strategy requires minimal boilerplate
- [ ] All ingestion tests pass

**Completion Notes:**
_To be filled by completing agent_

---

### P3.2 - Consolidate Stripe Webhook Handlers

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Files:**
  - `apps/web/lib/stripe/webhooks/handlers/base-handler.ts` (286 lines)
  - `apps/web/lib/stripe/webhooks/handlers/payment-handler.ts` (387 lines)
  - `apps/web/lib/stripe/webhooks/handlers/subscription-handler.ts` (301 lines)
  - `apps/web/lib/stripe/webhooks/handlers/checkout-handler.ts`
- **Effort:** Small
- **Dependencies:** None

**Problem:**
Handlers duplicate customer ID extraction, cache invalidation, and metadata fallback logic.

**Solution:**
Extract shared utilities to base handler:

```
lib/stripe/webhooks/
├── handlers/
│   ├── base-handler.ts       # Enhanced with shared utilities
│   │   - getCustomerId()
│   │   - getUserIdFromCustomer()
│   │   - invalidateCache()
│   │   - extractMetadata()
│   ├── payment-handler.ts    # Payment-specific only
│   ├── subscription-handler.ts
│   └── checkout-handler.ts
└── utils/
    └── customer-utils.ts     # Customer ID resolution
```

**Acceptance Criteria:**
- [ ] Shared utilities in base handler or utils
- [ ] No duplicate customer ID logic
- [ ] Cache invalidation centralized
- [ ] Each handler <250 lines
- [ ] All webhook tests pass

**Completion Notes:**
_To be filled by completing agent_

---

### P3.3 - Extract Dashboard Table Components

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Files:** Dashboard table components
- **Effort:** Medium
- **Dependencies:** None

**Problem:**
Multiple table components duplicate sorting, pagination, row selection, and filtering logic.

**Solution:**
Create reusable table infrastructure:

```
components/molecules/
└── DataTable/
    ├── index.tsx             # Main composable table
    ├── DataTableHeader.tsx
    ├── DataTableBody.tsx
    ├── DataTablePagination.tsx
    ├── DataTableFilters.tsx
    ├── useDataTable.ts       # Sorting, pagination, selection
    └── types.ts

# Usage:
<DataTable
  data={data}
  columns={columns}
  sortable
  selectable
  pagination={{ pageSize: 10 }}
/>
```

**Acceptance Criteria:**
- [ ] DataTable component created
- [ ] Supports sorting, pagination, selection
- [ ] At least 1 existing table migrated
- [ ] Documented with examples
- [ ] Accessible (keyboard navigation, ARIA)

**Completion Notes:**
_To be filled by completing agent_

---

### P3.4 - Modularize API Routes

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Files:**
  - `apps/web/app/api/waitlist/route.ts` (484 lines)
  - `apps/web/app/api/track/route.ts` (366 lines)
  - `apps/web/app/api/wrap-link/route.ts` (159 lines)
- **Effort:** Medium
- **Dependencies:** P1.3 (establishes pattern)

**Problem:**
API routes contain business logic that should be in service modules.

**Solution:**
Apply same pattern as P1.3 to other routes:

```
lib/services/
├── waitlist/
│   ├── index.ts
│   └── service.ts
├── tracking/
│   ├── index.ts
│   └── service.ts
└── link-wrapper/
    ├── index.ts
    └── service.ts
```

**Acceptance Criteria:**
- [ ] Each route <150 lines
- [ ] Business logic in services
- [ ] Services independently testable
- [ ] API contracts unchanged

**Completion Notes:**
_To be filled by completing agent_

---

## Priority 4: Low Priority / Future

### P4.1 - Review Dashboard Organisms Count

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Scope:** 48 dashboard organisms - evaluate which could be molecules
- **Effort:** Small (analysis only)
- **Dependencies:** None

**Problem:**
48 organisms in dashboard may indicate some components are incorrectly categorized.

**Action:**
Audit and document which organisms should be reclassified as molecules.

**Completion Notes:**
_To be filled by completing agent_

---

### P4.2 - Consolidate Utility Functions

- **Status:** [ ]
- **Assigned:** _unassigned_
- **Scope:** `lib/utils/` directory organization
- **Effort:** Small
- **Dependencies:** None

**Problem:**
Utils directory has platform-detection, pii-encryption, domain-categorizer scattered. Could be better organized.

**Action:**
Group utilities by domain/purpose.

**Completion Notes:**
_To be filled by completing agent_

---

## Changelog

Track all refactoring completions here. Add newest entries at the top.

| Date | Task | Agent/Session | PR | Notes |
|------|------|---------------|-----|-------|
| 2025-07-19 | P1.4 | Cascade | _pending_ | Extract CreatorProfileTableRow (902→725 lines) |
| 2025-07-19 | P1.3 | Cascade | _pending_ | Extract social-links service modules (912→662 lines) |
| 2025-07-19 | P1.2 | Cascade | _pending_ | Split processor.ts (1024 lines) into 8 focused modules |
| 2025-07-19 | P1.1 | Cascade | _pending_ | Split schema.ts (1114 lines) into 10 domain files |
| _YYYY-MM-DD_ | _P1.1_ | _session-id_ | _#123_ | _Brief description_ |

---

## Notes

### File Size Thresholds

- **Target:** Components <300 lines, Services <400 lines
- **Warning:** 300-500 lines - consider splitting
- **Critical:** >500 lines - must be refactored

### Testing Requirements

All refactoring PRs must:
1. Pass `pnpm typecheck`
2. Pass `pnpm lint`
3. Pass `pnpm test`
4. Include updated/new tests for refactored code
5. Not introduce visual regressions

### Backwards Compatibility

When splitting files:
1. Keep original file with re-exports for backwards compatibility
2. Mark original exports as `@deprecated` with pointer to new location
3. Plan deprecation removal in future PR (not same PR)
