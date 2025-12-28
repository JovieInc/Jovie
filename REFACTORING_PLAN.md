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

- **Status:** [ ]
- **Assigned:** _unassigned_
- **File:** `apps/web/lib/db/schema.ts` (1113 lines)
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
│   ├── auth.ts           # users, sessions, profiles
│   ├── links.ts          # socialLinks, linkTypes, ingestion
│   ├── billing.ts        # subscriptions, payments, plans
│   ├── analytics.ts      # events, activity, metrics
│   ├── content.ts        # releases, providers, media
│   └── enums.ts          # All enum definitions
└── schema.ts             # Deprecated - re-exports from schema/index.ts
```

**Acceptance Criteria:**
- [ ] All tables moved to appropriate domain files
- [ ] All enums consolidated in `enums.ts`
- [ ] Original `schema.ts` re-exports everything for backwards compatibility
- [ ] All imports across codebase still work
- [ ] `pnpm typecheck` passes
- [ ] `pnpm drizzle:check` passes
- [ ] No runtime errors in existing tests

**Completion Notes:**
_To be filled by completing agent_

---

### P1.2 - Refactor Ingestion Processor

- **Status:** [ ]
- **Assigned:** _unassigned_
- **File:** `apps/web/lib/ingestion/processor.ts` (1023 lines)
- **Effort:** Large
- **Dependencies:** None

**Problem:**
Single processor handles 4+ job types with inline configuration, complex state management, and mixed concerns. Violates open/closed principle.

**Solution:**
Implement proper strategy pattern with job executors:

```
lib/ingestion/
├── processor.ts              # Slim orchestrator (~150 lines)
├── types.ts                  # Shared types
├── jobs/
│   ├── index.ts              # Job registry
│   ├── base-job.ts           # Abstract base class
│   ├── profile-extraction.ts # Profile extraction job
│   ├── link-validation.ts    # Link validation job
│   ├── enrichment.ts         # Profile enrichment job
│   └── confidence-calc.ts    # Confidence calculation job
└── strategies/               # Existing strategies (separate task)
```

**Acceptance Criteria:**
- [ ] Processor reduced to <200 lines
- [ ] Each job type in separate file with single responsibility
- [ ] Jobs implement common interface/base class
- [ ] Job registry allows easy addition of new job types
- [ ] All existing tests pass
- [ ] No change to external API/behavior

**Completion Notes:**
_To be filled by completing agent_

---

### P1.3 - Modularize Social Links API Route

- **Status:** [ ]
- **Assigned:** _unassigned_
- **File:** `apps/web/app/api/dashboard/social-links/route.ts` (911 lines)
- **Effort:** Medium
- **Dependencies:** None

**Problem:**
API route contains rate limiting, idempotency, 4 extraction strategies, validation, and business logic. Routes should be thin.

**Solution:**
Extract business logic into service module:

```
lib/services/
└── social-links/
    ├── index.ts              # Public API
    ├── service.ts            # Main service class (~200 lines)
    ├── rate-limiter.ts       # Rate limiting logic
    ├── idempotency.ts        # Idempotency key management
    ├── extraction.ts         # Strategy detection & execution
    └── validation.ts         # Link validation

app/api/dashboard/social-links/
└── route.ts                  # Thin route (~100 lines) - validation + delegation
```

**Acceptance Criteria:**
- [ ] Route file reduced to <150 lines
- [ ] All business logic in `lib/services/social-links/`
- [ ] Service is independently testable
- [ ] Existing API contract unchanged
- [ ] All integration tests pass

**Completion Notes:**
_To be filled by completing agent_

---

### P1.4 - Decompose AdminCreatorProfilesWithSidebar

- **Status:** [ ]
- **Assigned:** _unassigned_
- **File:** `apps/web/components/admin/AdminCreatorProfilesWithSidebar.tsx` (901 lines)
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
- [ ] Main component <200 lines
- [ ] Each sub-component has single responsibility
- [ ] State management extracted to custom hook
- [ ] Backwards compatible export maintained
- [ ] All admin functionality works
- [ ] Existing tests pass or updated

**Completion Notes:**
_To be filled by completing agent_

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
