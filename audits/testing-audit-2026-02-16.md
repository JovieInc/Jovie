# Testing Audit: Coverage Gaps, False Positives & Fail-Fast Improvements

**Date:** 2026-02-16
**Scope:** Interactive UI components — actions menus, right drawer links tabs, sidebar components
**Trigger:** Repeated production regressions in features that should be caught by tests

---

## Executive Summary

Production regressions in actions menus, drawer links tabs, and interactive sidebar components trace to **three systemic failures working in concert**:

1. **CI only runs 7 "critical" test files on PRs** — no UI component test runs unless a developer also modifies the test file in the same PR.
2. **Zero test coverage** for the specific components that keep breaking (CreatorActionsMenu, TableActionMenu, RightDrawer, all sidebar components, SidebarLinkRow, DrawerNav).
3. **Global over-mocking** replaces `@headlessui/react` with plain `<div>`s and mocks away entire components (`ContactSidebar`, `CreatorActionsMenu`, `TableRowActions`) in integration tests, creating false positives.

The testing infrastructure is excellent (Vitest, Playwright, quarantine system, axe audits, performance budgets). The problem is entirely about **what** gets tested and **when** it runs.

---

## 1. CI Pipeline Gap: Most Tests Don't Run on PRs

### What happens today

In `.github/workflows/ci.yml` (lines 770–802), the PR test strategy is:

```
1. Always run: *.critical.test.ts files (vitest matches "critical" substring)
2. Conditionally run: test files directly modified/added in the PR
3. Full suite: nightly only (2 AM UTC)
```

### The 7 critical test files

| File | What it tests |
|------|--------------|
| `tests/unit/api/health/db.critical.test.ts` | Database connectivity |
| `tests/unit/api/health/comprehensive.critical.test.ts` | Health endpoint |
| `tests/unit/api/health/env.critical.test.ts` | Environment variables |
| `tests/unit/api/health/auth.critical.test.ts` | Auth health check |
| `tests/unit/api/health/main.critical.test.ts` | Main health endpoint |
| `tests/unit/lib/stripe/webhooks/handlers/checkout-handler.critical.test.ts` | Stripe checkout |
| `tests/unit/lib/auth/session.critical.test.ts` | Auth session |

**Zero UI component tests are "critical."** A developer can break `CreatorActionsMenu.tsx` and CI will pass — unless they also touch its test file in the same PR.

### Recommended fix: Add `interaction` pattern to PR CI

The CI already uses pattern matching. Change the vitest invocation from:

```bash
# Current (ci.yml lines 780-784)
cd apps/web && pnpm vitest run --config=vitest.config.mts $COVERAGE_FLAG "critical"
```

To:

```bash
# Proposed
cd apps/web && pnpm vitest run --config=vitest.config.mts $COVERAGE_FLAG "critical|interaction"
```

Then name new test files with the `.interaction.test.tsx` suffix. These run on every PR alongside critical tests.

**Estimated CI impact:** +5–8 seconds per PR (10–15 focused tests at ~0.5s each). Well within the 10-minute smoke budget.

**Why not `vitest --related`?** The codebase has documented OOM issues with `--related`/`--changed` due to widely-imported modules like `AuthShellWrapper` (see ci.yml line 786–787 comment). The pattern approach is explicit and safe.

### Alternative: Component-path-aware test triggering

Create a mapping file at `apps/web/tests/critical-component-map.json`:

```json
{
  "components/admin/creator-actions-menu/": ["tests/components/admin/creator-actions-menu/"],
  "components/atoms/table-action-menu/": ["tests/components/atoms/table-action-menu/"],
  "components/organisms/RightDrawer.tsx": ["tests/components/organisms/RightDrawer.interaction.test.tsx"],
  "components/molecules/drawer/": ["tests/components/molecules/drawer/"],
  "components/organisms/contact-sidebar/": ["tests/components/organisms/contact-sidebar/"],
  "components/organisms/release-sidebar/": ["tests/components/organisms/release-sidebar/"],
  "components/dashboard/atoms/link-actions/": ["tests/components/dashboard/"]
}
```

Add a CI step after the `CHANGED_TESTS` detection (lines 788–795) that looks up related tests from this map for changed source files. This is more targeted than the pattern approach but requires maintaining the map.

---

## 2. Component Coverage Gap Matrix

### Components that keep breaking vs. test coverage

| Component | Source Path | Test File | Status |
|-----------|-----------|-----------|--------|
| **CreatorActionsMenu** | `components/admin/creator-actions-menu/CreatorActionsMenu.tsx` | None | Mocked to `() => <button>⋯</button>` in admin sidebar test |
| **TableActionMenu** | `components/atoms/table-action-menu/TableActionMenu.tsx` | None | No references in any test |
| **RightDrawer** | `components/organisms/RightDrawer.tsx` | None | Used in E2E only (requires auth) |
| **ReleaseSidebar** | `components/organisms/release-sidebar/ReleaseSidebar.tsx` | `ReleaseMetadata.test.tsx` | Partial — only metadata. **Links tab untested.** |
| **ReleaseDspLinks** | `components/organisms/release-sidebar/ReleaseDspLinks.tsx` | None | Complex: cooldown timers, CRUD, validation |
| **ContactSidebar** | `components/organisms/contact-sidebar/ContactSidebar.tsx` | None | Mocked to `() => null` in admin sidebar test |
| **DrawerNav** | `components/organisms/contact-sidebar/DrawerNav.tsx` | None | Tab switching for ContactSidebar |
| **ProfileContactSidebar** | `components/dashboard/organisms/profile-contact-sidebar/ProfileContactSidebar.tsx` | None | 4 category tabs, swipe actions |
| **ContactDetailSidebar** | `components/dashboard/organisms/contacts-table/ContactDetailSidebar.tsx` | None | Debounced auto-save, inline editing |
| **AudienceMemberSidebar** | `components/dashboard/organisms/audience-member-sidebar/AudienceMemberSidebar.tsx` | None | Context menu integration |
| **DrawerHeader** | `components/molecules/drawer/DrawerHeader.tsx` | None | Mobile/desktop icon switching |
| **SidebarLinkRow** | `components/molecules/drawer/SidebarLinkRow.tsx` | None | Copy, open, remove, swipe actions |
| **DrawerLinkSection** | `components/molecules/drawer/DrawerLinkSection.tsx` | None | Add button, empty state |
| **LinkActions** | `components/dashboard/atoms/link-actions/LinkActions.tsx` | `LinkActions.keyboard.test.tsx` | Partial — see Section 4 |

### UI package components (well-tested baseline)

These `@jovie/ui` primitives have solid test coverage and should **not** be re-tested in app tests:

| Component | Test File | Coverage |
|-----------|-----------|----------|
| `CommonDropdown` | `packages/ui/atoms/common-dropdown.test.tsx` | Actions, separators, checkboxes, radio, submenus, search, loading |
| `DropdownMenu` | `packages/ui/atoms/dropdown-menu.test.tsx` | Rendering, ARIA, keyboard nav |
| `ContextMenu` | `packages/ui/atoms/context-menu.test.tsx` | Right-click, items, separators, submenus, keyboard |
| `SearchableSubmenu` | `packages/ui/atoms/searchable-submenu.test.tsx` | Search, filtering, keyboard |

---

## 3. Tests to Write (Prioritized by Production Risk)

### Tier 1 — Components that keep breaking (write immediately)

#### 3.1 `CreatorActionsMenu.interaction.test.tsx`

**File:** `apps/web/tests/components/admin/creator-actions-menu/CreatorActionsMenu.interaction.test.tsx`

**Mock strategy:** Mock `next/link`, `next/navigation`, `@/hooks/useClipboard`. Do NOT mock `@jovie/ui` — the Radix DropdownMenu primitives work in jsdom.

**Test cases (~8 tests):**

```
describe('CreatorActionsMenu')
  ✅ opens dropdown on trigger click
  ✅ shows "Verify creator" for unverified, "Unverify creator" for verified
  ✅ shows "Feature" for unfeatured, "Unfeature" for featured
  ✅ copy claim link calls copyToClipboard and shows "Copied!" feedback
  ✅ "Copied!" reverts after 2000ms timeout
  ✅ trigger button is disabled when status='loading'
  ✅ unclaimed profile with claimToken shows "Copy claim link" and "Send invite"
  ✅ claimed profile does NOT show claim link section
  ❌ (negative) null claimToken on unclaimed profile hides claim section
  ❌ (negative) delete action fires onDelete (not silently swallowed)
```

**Key assertion for the "actions menu breaking" regression:** Test that `DropdownMenuItem onClick` handlers actually fire. The current mock (`() => <button>⋯</button>`) can never catch this.

#### 3.2 `SidebarLinkRow.interaction.test.tsx`

**File:** `apps/web/tests/components/molecules/drawer/SidebarLinkRow.interaction.test.tsx`

**Mock strategy:** Mock `navigator.clipboard.writeText`, `globalThis.open`. Mock `SwipeToReveal` to render children + actions directly (swipe gesture needs E2E).

**Test cases (~8 tests):**

```
describe('SidebarLinkRow')
  ✅ renders icon, label, and URL
  ✅ renders badge when provided
  ✅ copy button calls clipboard.writeText with correct URL
  ✅ copy button shows "Copied!" label, reverts after 1500ms
  ✅ open button calls globalThis.open with URL
  ✅ remove button calls onRemove when isEditable=true
  ✅ remove button is disabled when isRemoving=true
  ✅ remove button not rendered when isEditable=false
  ❌ (negative) clipboard.writeText rejection doesn't crash component
  ❌ (negative) empty URL doesn't crash copy/open handlers
```

#### 3.3 `RightDrawer.interaction.test.tsx`

**File:** `apps/web/tests/components/organisms/RightDrawer.interaction.test.tsx`

**Mock strategy:** Mock `@/hooks/useBreakpoint` to control mobile/desktop. Do NOT mock `@jovie/ui`.

**Test cases (~7 tests):**

```
describe('RightDrawer')
  ✅ renders children when isOpen=true
  ✅ sets aria-hidden=true when closed
  ✅ sets aria-hidden=false when open
  ✅ keyboard handler fires when drawer has focus and isOpen
  ✅ keyboard handler does NOT fire when drawer is closed
  ✅ context menu renders when contextMenuItems provided
  ✅ (mobile) renders fixed overlay; (desktop) renders inline sidebar
  ❌ (negative) no keyboard handler registered when onKeyDown is undefined
```

#### 3.4 `DrawerHeader.interaction.test.tsx`

**File:** `apps/web/tests/components/molecules/drawer/DrawerHeader.interaction.test.tsx`

**Mock strategy:** Mock `@/hooks/useBreakpoint`.

**Test cases (~4 tests):**

```
describe('DrawerHeader')
  ✅ renders title text
  ✅ close button calls onClose
  ✅ mobile shows "Go back" aria-label
  ✅ desktop shows "Close sidebar" aria-label
```

### Tier 2 — Supporting interactive components (write next sprint)

#### 3.5 `TableActionMenu.interaction.test.tsx`

**File:** `apps/web/tests/components/atoms/table-action-menu/TableActionMenu.interaction.test.tsx`

**Mock strategy:** None beyond default. CommonDropdown works in jsdom.

**Test cases (~6 tests):**

```
describe('TableActionMenu')
  ✅ default button trigger renders and opens menu
  ✅ action items fire onClick
  ✅ separator items render correctly
  ✅ submenu items render with children
  ✅ context menu variant opens on right-click
  ✅ custom trigger variant renders children as trigger
```

#### 3.6 `DrawerNav.interaction.test.tsx`

**File:** `apps/web/tests/components/organisms/contact-sidebar/DrawerNav.interaction.test.tsx`

**Mock strategy:** None.

**Test cases (~4 tests):**

```
describe('DrawerNav')
  ✅ renders all nav items with labels
  ✅ active tab has aria-selected=true
  ✅ clicking inactive tab calls onValueChange with correct value
  ✅ renders icons when provided
```

#### 3.7 Strengthen existing `LinkActions.keyboard.test.tsx`

**Add to existing file** at `apps/web/tests/components/dashboard/LinkActions.keyboard.test.tsx`:

```
  ✅ menu closes after action is clicked
  ✅ Escape key closes menu
  ✅ ArrowDown/ArrowUp navigates menu items
  ❌ (negative) onEdit undefined → "Edit" menu item not shown
  ❌ (negative) confirm dialog shows "Delete link?" title and description
  ❌ (negative) cancel in confirm dialog does NOT call onRemove
```

### Tier 3 — Sidebar composition tests (write following sprint)

#### 3.8 `ContactSidebar.interaction.test.tsx`

**Test cases (~6 tests):**

```
describe('ContactSidebar')
  ✅ empty state shows "Select a row" when no contact
  ✅ header renders with contact name
  ✅ tab switching between Details and Social works
  ✅ Details tab shows avatar and fields
  ✅ Social tab shows website and social links
  ❌ (negative) missing contact data doesn't crash
```

#### 3.9 `ReleaseSidebar-links.interaction.test.tsx`

**Test cases (~5 tests):**

```
describe('ReleaseSidebar Links tab')
  ✅ tab switching between Catalog, Links, Details works via SegmentControl
  ✅ Links tab renders DSP links when present
  ✅ empty state renders when no release selected
  ✅ tab resets to Catalog when release changes
  ❌ (negative) ISRC rescan button disabled during cooldown
```

---

## 4. False Positive Analysis

### 4.1 Global over-mocking in `setup-mocks.ts`

**File:** `apps/web/tests/setup-mocks.ts` (lines 283–528)

`setupComponentMocks()` replaces ALL `@headlessui/react` components with plain `<div>`s:
- `Menu` → `<div>` (loses open/close behavior, keyboard nav)
- `Tab` / `TabGroup` / `TabPanel` → `<div>` (loses tab selection, panel switching)
- `Dialog` → `<div>` (loses focus trapping, escape-to-close)
- `Popover` → `<div>` (loses click-outside-to-close)
- `Transition` → `<div>` (loses enter/leave visibility)

**Impact:** Tests pass even when the real Headless UI behavior would break. If a Headless UI upgrade changes the Menu keyboard navigation API, no test catches it.

**Mitigation:** Do NOT modify `setup-mocks.ts` (used by hundreds of existing tests). Instead, ensure new `*.interaction.test.tsx` files **never** import `setupComponentMocks`. The `setup-optimized.ts` config does not load these mocks by default. New tests should use real `@jovie/ui` components, which are Radix-based and work in jsdom.

### 4.2 `LinkActions.keyboard.test.tsx` over-mocking

**File:** `apps/web/tests/components/dashboard/LinkActions.keyboard.test.tsx`

| Line | Mock | What it hides |
|------|------|---------------|
| 7–25 | `@jovie/ui` → Tooltip as empty fragment, Button as plain `<button>` | Tooltip rendering, Button variants/sizing |
| 33–52 | `ConfirmDialog` → renders `<button>` when `open=true` | Real dialog behavior: focus trapping, escape-to-close, cancel button |

**Specific false positive risk:** The test at line 103–109 confirms deletion via a mock button (`data-testid='confirm-delete'`). In production, the real `ConfirmDialog` uses `AlertDialog` from `@jovie/ui` (Radix). If `AlertDialog` breaks or the `onConfirm` prop wiring changes, this test still passes because it's testing the mock, not the real component.

**Fix:** Write a new `LinkActions.negative.interaction.test.tsx` that uses the real `ConfirmDialog` (mock only the Radix AlertDialog primitives at the UI package level, which are already tested). This test would catch wiring issues between `LinkActions` and `ConfirmDialog`.

### 4.3 Admin sidebar test mocking

**File:** `apps/web/tests/components/admin-creator-profiles-with-sidebar.test.tsx`

| Line | Mock | What it hides |
|------|------|---------------|
| 52–54 | `ContactSidebar → () => null` | Entire sidebar functionality |
| 56–66 | `TableRowActions → static disabled button` | Action handler wiring, enabled/disabled logic |
| 68–74 | `CreatorActionsMenu → static button` | All 8+ action handlers, copy feedback, conditional rendering |

**Assessment:** This test is correctly scoped to table rendering logic (row display, sorting, column visibility). The mocking is appropriate for its purpose. The problem is that the mocked-away components have **no tests of their own**. The Tier 1 tests above fill this gap.

---

## 5. Untested Interaction Patterns

These patterns are used across multiple breaking components and have zero test coverage:

| Pattern | Where Used | Test Strategy |
|---------|-----------|---------------|
| **Tab switching** (SegmentControl) | ReleaseSidebar, ProfileContactSidebar | SegmentControl already tested in `packages/ui/`. Composition tests verify tab content changes. |
| **Tab switching** (DrawerNav) | ContactSidebar | New `DrawerNav.interaction.test.tsx` (Tier 2) |
| **Copy-to-clipboard with timeout** | SidebarLinkRow, CreatorActionsMenu | Mock `navigator.clipboard.writeText`. Verify "Copied!" state. Use `vi.useFakeTimers()` to advance, verify revert. |
| **Swipe-to-reveal** actions | SidebarLinkRow, ProfileLinkList | Unit: verify action buttons render. Swipe gesture: E2E only (touch events need real browser). |
| **Context menu on drawer** | RightDrawer, ReleaseSidebar | Test via CommonDropdown (already tested). Verify items passed correctly. |
| **Cooldown timer** (ISRC rescan) | ReleaseDspLinks | Test button disabled during cooldown. Use `vi.useFakeTimers()` + `vi.advanceTimersByTime()`. |
| **Debounced auto-save** | ContactDetailSidebar | Test value change fires after debounce period with fake timers. |
| **Mobile/desktop responsive** | RightDrawer, DrawerHeader | Mock `useBreakpointDown` to return true/false. Verify different rendered output. |

### Timer testing template

For components with timeouts/cooldowns (SidebarLinkRow, CreatorActionsMenu, ReleaseDspLinks):

```typescript
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('copy feedback reverts after timeout', async () => {
  // ... trigger copy action
  expect(screen.getByLabelText('Copied!')).toBeInTheDocument();

  vi.advanceTimersByTime(1500);

  expect(screen.queryByLabelText('Copied!')).not.toBeInTheDocument();
});
```

---

## 6. Negative & Error Test Gaps

### Per-component negative test checklist

#### CreatorActionsMenu

- [ ] `profile.claimToken` is null for unclaimed profile → claim section hidden (no crash)
- [ ] `copyToClipboard` returns false → "Copied!" feedback NOT shown
- [ ] `status` transitions from `'loading'` to `'error'` → error animation class applied
- [ ] Rapid click on delete while loading → button stays disabled

#### SidebarLinkRow

- [ ] `navigator.clipboard.writeText` rejects → no crash, button remains functional
- [ ] `url` is empty string → copy/open handlers don't crash
- [ ] `onRemove` called while `isRemoving=true` → button disabled, no double-fire

#### LinkActions

- [ ] `onEdit` is undefined → "Edit" menu item not rendered
- [ ] Confirm dialog cancel → `onRemove` NOT called
- [ ] Confirm dialog shows correct title "Delete link?" and description
- [ ] Menu closes after item click (verify `open` state transitions to false)
- [ ] Focus returns to trigger button after menu closes

#### RightDrawer

- [ ] `onKeyDown` is undefined → no event listener registered
- [ ] `contextMenuItems` is empty array → no context menu wrapper rendered
- [ ] `isOpen` changes from true to false → `aria-hidden` updates synchronously

#### ReleaseDspLinks

- [ ] Add button disabled when URL is invalid and provider is selected
- [ ] Add button disabled when URL is valid but no provider selected
- [ ] Rescan button disabled during cooldown period
- [ ] Cooldown timer displays correct remaining time
- [ ] Cancel button clears form state (URL, provider, isAddingLink)

---

## 7. Prioritized Action Items

### Immediate (blocks regressions right now)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Change CI vitest pattern** from `"critical"` to `"critical\|interaction"` in `.github/workflows/ci.yml` lines 780, 784, 801 | 30 min | All new interaction tests run on every PR |
| 2 | **Write `CreatorActionsMenu.interaction.test.tsx`** | 2 hrs | Catches the most-reported regression |
| 3 | **Write `SidebarLinkRow.interaction.test.tsx`** | 1.5 hrs | Catches links tab regressions |
| 4 | **Write `RightDrawer.interaction.test.tsx`** | 1.5 hrs | Catches drawer open/close/keyboard regressions |
| 5 | **Write `DrawerHeader.interaction.test.tsx`** | 45 min | Catches mobile/desktop icon switching |

### Next sprint (high value, moderate effort)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 6 | Write `TableActionMenu.interaction.test.tsx` | 1 hr | Covers all table row action menus |
| 7 | Write `DrawerNav.interaction.test.tsx` | 45 min | Covers ContactSidebar tab switching |
| 8 | Strengthen `LinkActions.keyboard.test.tsx` (6 new tests) | 1 hr | Fills escape/arrow/focus gaps |
| 9 | Write `LinkActions.negative.interaction.test.tsx` with real ConfirmDialog | 1.5 hrs | Eliminates ConfirmDialog false positive |

### Following sprint (composition + resilience)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 10 | Write `ContactSidebar.interaction.test.tsx` | 2 hrs | Full sidebar flow coverage |
| 11 | Write `ReleaseSidebar-links.interaction.test.tsx` | 2 hrs | DSP links CRUD + cooldown |
| 12 | Create `critical-component-map.json` + update CI | 2 hrs | Smart test selection for source changes |
| 13 | After 1–2 weeks stability, promote top 3 to `*.critical.test.tsx` | 30 min | Guarantees they always run |

### Total estimated effort: ~16 hours across 3 sprints

---

## 8. `*.interaction.test.tsx` Convention

### Naming

Files named `*.interaction.test.tsx` will automatically run on every PR after the CI pattern change (item #1). Use this suffix for tests that exercise user-facing interactive behavior.

### Mocking rules

| Mock | Do NOT mock |
|------|------------|
| `next/navigation` (useRouter) | `@jovie/ui` components (Radix — works in jsdom) |
| `next/link` | `@headlessui/react` (only used in legacy paths) |
| `@clerk/nextjs` (auth) | `framer-motion` (skip in interaction tests) |
| `navigator.clipboard` | Component children |
| `globalThis.open` | `ConfirmDialog` (test the real wiring) |
| API fetch calls | |

### Do NOT import `setupComponentMocks`

The `setup-optimized.ts` vitest setup file does not load `setupComponentMocks()`. New interaction tests should never import it. The `@jovie/ui` Radix primitives (DropdownMenu, AlertDialog, CommonDropdown) work in jsdom and are already tested in `packages/ui/atoms/*.test.tsx`.

### Performance target

Each interaction test file should complete in < 2 seconds. If a test takes longer, it belongs in the nightly suite, not the PR suite.

---

## 9. What NOT to Do

| Avoid | Why |
|-------|-----|
| Rewriting existing tests | The admin sidebar test is correctly scoped. Add separate component tests instead. |
| Removing global mocks in `setup-mocks.ts` | Used by hundreds of existing tests. New tests simply don't import it. |
| Adding E2E tests for these components | E2E requires Clerk auth, is slow, and blocks deploys. Unit interaction tests catch the same regressions 10x faster. |
| Using `vitest --related` in CI | Documented OOM risk (ci.yml line 786–787). The pattern approach is safer. |
| Over-testing `@jovie/ui` primitives in app tests | Already thoroughly tested in `packages/ui/atoms/`. Test composition, not primitives. |
| Adding tests that depend on animation timing | Mock `framer-motion` or skip animation assertions. Animation tests are inherently flaky. |

---

## 10. Success Criteria

After implementing all items:

- [ ] Every PR that modifies a component in the coverage matrix (Section 2) triggers at least one relevant test
- [ ] Zero components in the "keeps breaking" list have empty test coverage
- [ ] No test for interactive behavior uses `setupComponentMocks()` (false-positive-free)
- [ ] CI PR feedback time stays under 10 minutes
- [ ] Negative tests exist for clipboard failures, undefined callbacks, and rapid state changes

---

## Appendix: File Reference

All source paths are relative to `apps/web/` unless stated otherwise.

### Source files audited

| File | Lines | Key patterns |
|------|-------|-------------|
| `components/admin/creator-actions-menu/CreatorActionsMenu.tsx` | 262 | DropdownMenu, copy-to-clipboard, conditional rendering by profile state |
| `components/atoms/table-action-menu/TableActionMenu.tsx` | 116 | CommonDropdown wrapper, separator/submenu conversion, 3 trigger variants |
| `components/organisms/RightDrawer.tsx` | 116 | Mobile/desktop responsive, keyboard handler, context menu, aria-hidden |
| `components/molecules/drawer/DrawerHeader.tsx` | 57 | Mobile ArrowLeft / desktop X icon, onClose |
| `components/molecules/drawer/SidebarLinkRow.tsx` | 176 | Clipboard, globalThis.open, SwipeToReveal, remove with isRemoving |
| `components/organisms/contact-sidebar/DrawerNav.tsx` | 57 | Tab buttons, aria-selected, onValueChange |
| `components/organisms/release-sidebar/ReleaseDspLinks.tsx` | 327 | ISRC rescan cooldown, add/remove DSP links, provider selection, URL validation |
| `components/dashboard/atoms/link-actions/LinkActions.tsx` | 155 | Custom menu with keyboard nav, ConfirmDialog, memo |

### Test infrastructure files

| File | Role |
|------|------|
| `tests/setup-mocks.ts` | Global mocks (Headless UI, framer-motion, Clerk, etc.) |
| `tests/setup-optimized.ts` | Lightweight setup for optimized vitest config |
| `.github/workflows/ci.yml` | CI pipeline — PR/push/nightly test orchestration |
| `tests/TESTING.md` | Testing guide — tiers, running tests, adding tests |
| `packages/ui/atoms/common-dropdown.test.tsx` | Reference for Radix dropdown testing pattern |
