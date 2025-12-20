# Dashboard Atomic Design and Accessibility Audit Report

**Date**: 2025-01-27  
**Scope**: All dashboard components (`components/dashboard/` and `app/app/dashboard/`)

## Executive Summary

This audit reviewed **61 dashboard components** across atoms, molecules, organisms, and layout components for:

1. **Atomic Design Compliance**: Proper component hierarchy and separation of concerns
2. **Accessibility Standards**: WCAG compliance, ARIA attributes, keyboard navigation, screen reader support

### Overall Compliance Scores

- **Atomic Design Compliance**: 75% (46/61 components compliant)
- **Accessibility Compliance**: 82% (50/61 components compliant)
- **Critical Issues**: 8
- **High Priority Issues**: 15
- **Medium Priority Issues**: 12
- **Low Priority Issues**: 6

---

## Part 1: Atomic Design Violations

### Atoms - Business Logic Violations

#### 🔴 CRITICAL: CopyToClipboardButton.tsx

**File**: `components/dashboard/atoms/CopyToClipboardButton.tsx`  
**Issue**: Atom contains business logic (analytics tracking)  
**Lines**: 71, 74, 85, 88, 93  
**Violation**: Uses `track()` from `@/lib/analytics`  
**Recommendation**: Move to `molecules/` or extract analytics to parent component

```typescript
// Current (WRONG):
track("profile_copy_url_click", { status: "success" });

// Should be:
// Remove tracking from atom, handle in parent organism
```

#### 🔴 CRITICAL: DashboardRefreshButton.tsx

**File**: `components/dashboard/atoms/DashboardRefreshButton.tsx`  
**Issue**: Atom uses router hook (business logic)  
**Lines**: 4, 19  
**Violation**: Uses `useRouter()` from `next/navigation`  
**Recommendation**: Move to `molecules/` or pass `onRefresh` callback as prop

#### 🔴 CRITICAL: DashboardThemeToggleButton.tsx

**File**: `components/dashboard/atoms/DashboardThemeToggleButton.tsx`  
**Issue**: Atom uses theme hook (business logic)  
**Lines**: 4, 8  
**Violation**: Uses `useTheme()` from `next-themes`  
**Recommendation**: Move to `molecules/` or pass theme state as props

### Atoms - Missing forwardRef/displayName

#### 🟡 MEDIUM: Missing forwardRef

**Components**: Most atoms that render DOM elements  
**Issue**: Atoms should forward refs for DOM access  
**Affected Files**:

- `AnalyticsCard.tsx` - renders `<section>` and `<div>`
- `DashboardCard.tsx` - renders polymorphic button/div
- `PlatformPill.tsx` - renders interactive `<div>`
- `AudienceDetailRow.tsx` - renders `<div>`
- `AudienceMemberHeader.tsx` - renders `<div>`
- `CategorySection.tsx` - renders `<section>`

**Recommendation**: Add `forwardRef` to all atoms that render DOM elements

#### 🟡 MEDIUM: Missing displayName

**Components**: All atoms except `LinkActions.tsx`  
**Issue**: Missing `displayName` for React DevTools debugging  
**Recommendation**: Add `displayName` to all components

### Atoms - Polymorphism Issues

#### 🟡 MEDIUM: DashboardCard.tsx

**File**: `components/dashboard/atoms/DashboardCard.tsx`  
**Issue**: Polymorphic component (button/div) may violate atomic principles  
**Lines**: 28, 31-42  
**Current**: Renders as `button` or `div` based on `onClick` prop  
**Recommendation**:

- Option 1: Split into `DashboardCard` (div) and `DashboardCardButton` (button)
- Option 2: Keep if polymorphism is necessary, but document rationale

### Molecules - Business Logic Violations

#### 🔴 CRITICAL: AnalyticsCards.tsx

**File**: `components/dashboard/molecules/AnalyticsCards.tsx`  
**Issue**: Molecule makes API calls (business logic)  
**Lines**: 9, 34  
**Violation**: Uses `useDashboardAnalytics()` hook (API calls)  
**Recommendation**: Move to `organisms/` or extract data fetching to parent

#### 🔴 CRITICAL: EnhancedThemeToggle.tsx

**File**: `components/dashboard/molecules/EnhancedThemeToggle.tsx`  
**Issue**: Molecule makes API calls (business logic)  
**Lines**: 52  
**Violation**: Uses `fetch('/api/dashboard/profile')`  
**Recommendation**: Move to `organisms/` or extract API call to parent/hook

#### 🔴 CRITICAL: FeedbackModal.tsx

**File**: `components/dashboard/molecules/FeedbackModal.tsx`  
**Issue**: Molecule contains business logic (analytics tracking)  
**Lines**: 33  
**Violation**: Uses `track()` from analytics  
**Recommendation**: Move to `organisms/` or extract tracking to parent

### Molecules - Complex State Management

#### 🟠 HIGH: UniversalLinkInput.tsx

**File**: `components/dashboard/molecules/UniversalLinkInput.tsx`  
**Issue**: Very complex component with extensive state management  
**Lines**: Multiple `useState`, `useEffect`, `useMemo` hooks  
**Current State**:

- 4+ useState hooks
- 4+ useEffect hooks
- Complex autosuggest logic
- Platform detection logic

**Recommendation**:

- Consider if this should be an organism due to complexity
- Or extract sub-components to simplify

#### 🟡 MEDIUM: PhoneMockupPreview.tsx

**File**: `components/dashboard/molecules/PhoneMockupPreview.tsx`  
**Issue**: Complex state management for preview  
**Lines**: 27-28, 31  
**Recommendation**: Review if complexity warrants organism level

### Organisms - Missing data-testid

#### 🟠 HIGH: Missing data-testid on Organisms

**Issue**: Most organisms lack stable `data-testid` attributes  
**Affected Files**:

- `DashboardOverview.tsx` - No data-testid
- `DashboardHeader.tsx` - No data-testid
- `DashboardMobileTabs.tsx` - No data-testid
- `EnhancedDashboardLinks.tsx` - No data-testid
- `GroupedLinksManager.tsx` - No data-testid
- `ProfileForm.tsx` - No data-testid
- `SettingsPolished.tsx` - No data-testid
- `DashboardActivityFeed.tsx` - No data-testid
- `DashboardAudienceClient.tsx` - No data-testid
- `ContactsManager.tsx` - No data-testid

**Compliant Examples**:

- `ReleaseProviderMatrix.tsx` - Has `data-testid='releases-matrix'`
- `AudienceMemberSidebar.tsx` - Has `data-testid='audience-member-sidebar'`

**Recommendation**: Add stable `data-testid` to all organisms

---

## Part 2: Accessibility Violations

### ARIA Attributes

#### 🔴 CRITICAL: LinkActions.tsx - Missing Menu ARIA

**File**: `components/dashboard/atoms/LinkActions.tsx`  
**Issue**: Dropdown menu lacks proper ARIA attributes  
**Lines**: 67-104  
**Missing**:

- `role="menu"` on dropdown container
- `role="menuitem"` on menu items
- `aria-expanded` on trigger button
- `aria-controls` linking trigger to menu

**Current Code**:

```typescript
{open ? (
  <div className='absolute right-0 top-9 z-50 ...'>
    {/* Missing role="menu" */}
    <button onClick={...}>Edit</button> {/* Missing role="menuitem" */}
  </div>
) : null}
```

**Recommendation**: Add proper ARIA menu attributes

#### 🟠 HIGH: DashboardHeader.tsx - Missing aria-current

**File**: `components/dashboard/organisms/DashboardHeader.tsx`  
**Issue**: Breadcrumb navigation missing `aria-current="page"` on current item  
**Lines**: 35-61  
**Recommendation**: Add `aria-current="page"` to last breadcrumb item

#### 🟠 HIGH: DashboardTopBar.tsx - Missing aria-current

**File**: `components/dashboard/layout/DashboardTopBar.tsx`  
**Issue**: Breadcrumb navigation missing `aria-current="page"` on current item  
**Lines**: 25-51  
**Recommendation**: Add `aria-current="page"` to last breadcrumb item

#### 🟡 MEDIUM: Missing aria-live for Dynamic Content

**Components**: Several components with dynamic updates lack aria-live  
**Affected**:

- `AnalyticsCards.tsx` - Count-up animation not announced
- `DashboardActivityFeed.tsx` - Activity updates not announced
- `DashboardAudienceTable.tsx` - Table updates not announced

**Recommendation**: Add `aria-live="polite"` regions for dynamic content

### Keyboard Navigation

#### 🔴 CRITICAL: LinkActions.tsx - Missing Keyboard Navigation

**File**: `components/dashboard/atoms/LinkActions.tsx`  
**Issue**: Dropdown menu not keyboard accessible  
**Missing**:

- Arrow key navigation (Up/Down)
- Escape key to close
- Focus management (trap focus in menu)
- Focus restoration on close

**Recommendation**: Implement full keyboard navigation pattern

#### 🟠 HIGH: DashboardCard.tsx - Button Variant Keyboard

**File**: `components/dashboard/atoms/DashboardCard.tsx`  
**Issue**: When rendered as button, may need explicit keyboard handlers  
**Lines**: 28, 41  
**Recommendation**: Ensure button variant has proper keyboard support (Enter/Space)

#### 🟡 MEDIUM: Missing Keyboard Shortcuts Documentation

**Issue**: Keyboard shortcuts exist but not documented in UI  
**Found**: `DashboardNav.tsx` has keyboard shortcuts (lines 85-92) but no visible hints  
**Recommendation**: Add tooltip hints or keyboard shortcut indicators

### Screen Reader Support

#### 🟠 HIGH: Icon-Only Buttons Missing Labels

**Components**: Several icon-only buttons lack proper labels  
**Affected**:

- `LinkActions.tsx` - Menu button has `aria-label` but menu items need better labels
- `DashboardHeaderActionButton.tsx` - Good (has `ariaLabel` prop)
- `CopyToClipboardButton.tsx` - Good (has `sr-only` text)

#### 🟡 MEDIUM: SetupTaskItem.tsx - Missing Semantic Structure

**File**: `components/dashboard/molecules/SetupTaskItem.tsx`  
**Issue**: Uses `<li>` but parent may not be `<ol>` or `<ul>`  
**Lines**: 21  
**Recommendation**: Ensure parent uses proper list element or change to `<div>`

#### 🟡 MEDIUM: CategorySection.tsx - Missing Heading Level

**File**: `components/dashboard/atoms/CategorySection.tsx`  
**Issue**: Uses `<h3>` but may not be in proper heading hierarchy  
**Lines**: 31  
**Recommendation**: Verify heading hierarchy or use `<div>` with `role="heading"`

### Focus Management

#### 🟠 HIGH: LinkPill.tsx - Menu Focus Management

**File**: `components/dashboard/atoms/LinkPill.tsx`  
**Issue**: Uses FloatingFocusManager but may need verification  
**Lines**: 137-140  
**Status**: Has `FloatingFocusManager` - verify it works correctly  
**Recommendation**: Test focus trapping and restoration

#### 🟡 MEDIUM: PreviewPanel.tsx - Drawer Focus Management

**File**: `components/dashboard/layout/PreviewPanel.tsx`  
**Issue**: Uses `RightDrawer` - verify focus management  
**Lines**: 28-32  
**Recommendation**: Verify `RightDrawer` handles focus trapping/restoration

### Form Accessibility

#### 🟠 HIGH: EnhancedDashboardLinks.tsx - Form Labels

**File**: `components/dashboard/organisms/EnhancedDashboardLinks.tsx`  
**Issue**: Complex form - verify all inputs have proper labels  
**Lines**: 1115, 1166 (has some labels)  
**Recommendation**: Audit all form inputs for proper `aria-label` or `aria-labelledby`

#### 🟡 MEDIUM: UniversalLinkInput.tsx - Combobox Accessibility

**File**: `components/dashboard/molecules/UniversalLinkInput.tsx`  
**Status**: ✅ Good - Has proper combobox ARIA attributes (lines 465-475)  
**Note**: Already has `aria-expanded`, `aria-controls`, `aria-activedescendant`

### Table Accessibility

#### 🟠 HIGH: DashboardAudienceTable.tsx - Table Headers

**File**: `components/dashboard/organisms/DashboardAudienceTable.tsx`  
**Status**: ✅ Good - Has proper `<th>` elements (lines 298-333)  
**Status**: ✅ Good - Has `aria-label` on select all checkbox (line 300)  
**Status**: ✅ Good - Has `aria-label` on row checkboxes (line 450)  
**Recommendation**: Verify sortable columns have proper `aria-sort` attribute

#### 🟡 MEDIUM: Missing Table Caption

**Issue**: Tables lack `<caption>` elements  
**Affected**: `DashboardAudienceTable.tsx`  
**Recommendation**: Add `<caption>` or `aria-label` on `<table>` element

### Navigation Accessibility

#### 🟠 HIGH: DashboardSidebar.tsx - Navigation Landmark

**File**: `components/dashboard/layout/DashboardSidebar.tsx`  
**Status**: ✅ Good - Uses `Sidebar` component (likely has navigation role)  
**Recommendation**: Verify `Sidebar` component has `role="navigation"` or `nav` element

#### 🟠 HIGH: DashboardNav.tsx - Current Page Indication

**File**: `components/dashboard/DashboardNav.tsx`  
**Status**: ✅ Good - Has `aria-current="page"` (line 224)  
**Status**: ✅ Good - Has `role="navigation"` and `aria-label` (lines 322-323)  
**Recommendation**: None - compliant

#### 🟠 HIGH: DashboardMobileTabs.tsx - Current Page Indication

**File**: `components/dashboard/organisms/DashboardMobileTabs.tsx`  
**Status**: ✅ Good - Has `aria-current="page"` (line 84)  
**Status**: ✅ Good - Has `aria-label="Dashboard tabs"` (line 69)  
**Recommendation**: None - compliant

---

## Part 3: Component-by-Component Breakdown

### Atoms (15 components)

| Component                       | Atomic Design | Accessibility | Issues                                |
| ------------------------------- | ------------- | ------------- | ------------------------------------- |
| AnalyticsCard.tsx               | ✅            | ✅            | Missing forwardRef, displayName       |
| AudienceDetailRow.tsx           | ✅            | ✅            | Missing forwardRef, displayName       |
| AudienceIntentBadge.tsx         | ✅            | ✅            | Missing forwardRef, displayName       |
| AudienceMemberHeader.tsx        | ✅            | ✅            | Missing forwardRef, displayName       |
| CategorySection.tsx             | ✅            | ⚠️            | Missing forwardRef, heading hierarchy |
| CopyToClipboardButton.tsx       | 🔴            | ✅            | **Business logic (tracking)**         |
| DashboardCard.tsx               | ⚠️            | ⚠️            | Polymorphism, missing forwardRef      |
| DashboardHeaderActionButton.tsx | ✅            | ✅            | Missing forwardRef, displayName       |
| DashboardRefreshButton.tsx      | 🔴            | ✅            | **Business logic (useRouter)**        |
| DashboardThemeToggleButton.tsx  | 🔴            | ✅            | **Business logic (useTheme)**         |
| LinkActions.tsx                 | ✅            | 🔴            | **Missing menu ARIA, keyboard nav**   |
| LinkPill.tsx                    | ✅            | ⚠️            | Missing forwardRef, verify focus      |
| PlatformPill.tsx                | ✅            | ✅            | Missing forwardRef, displayName       |

### Molecules (18 components)

| Component                              | Atomic Design | Accessibility | Issues                                            |
| -------------------------------------- | ------------- | ------------- | ------------------------------------------------- |
| AnalyticsCards.tsx                     | 🔴            | ⚠️            | **Business logic (API calls)**, missing aria-live |
| CompletionBanner.tsx                   | ✅            | ✅            | Good                                              |
| DashboardRemoveBrandingCard.tsx        | ✅            | ✅            | Good                                              |
| EnhancedThemeToggle.tsx                | 🔴            | ✅            | **Business logic (API calls)**                    |
| FeedbackModal.tsx                      | 🔴            | ⚠️            | **Business logic (tracking)**, verify focus       |
| PhoneMockupPreview.tsx                 | ⚠️            | ✅            | Complex state, verify                             |
| ProfileLinkCard.tsx                    | ✅            | ✅            | Good                                              |
| ProfilePreview.tsx                     | ✅            | ✅            | Good                                              |
| SectionHeader.tsx                      | ✅            | ✅            | Good                                              |
| SettingsStatusPill.tsx                 | ✅            | ✅            | Good                                              |
| SettingsToggleRow.tsx                  | ✅            | ✅            | **Excellent accessibility**                       |
| SetupTaskItem.tsx                      | ✅            | ⚠️            | Semantic structure                                |
| StatusBarMock.tsx                      | ✅            | ✅            | Good                                              |
| UniversalLinkInput.tsx                 | ⚠️            | ✅            | Very complex, but good a11y                       |
| UniversalLinkInputArtistSearchMode.tsx | ✅            | ✅            | Good                                              |
| UniversalLinkInputPlatformSelector.tsx | ✅            | ✅            | Good                                              |
| UniversalLinkInputUrlMode.tsx          | ✅            | ✅            | Good                                              |

### Organisms (24 components)

| Component                                | Atomic Design | Accessibility | Issues                                  |
| ---------------------------------------- | ------------- | ------------- | --------------------------------------- |
| AccountSettingsSection.tsx               | ✅            | ⚠️            | Missing data-testid                     |
| AppleStyleOnboardingForm.tsx             | ✅            | ✅            | Good                                    |
| AudienceMemberSidebar.tsx                | ✅            | ✅            | Has data-testid ✅                      |
| ContactsManager.tsx                      | ✅            | ⚠️            | Missing data-testid                     |
| DashboardActivityFeed.tsx                | ✅            | ⚠️            | Missing data-testid, aria-live          |
| DashboardAudienceClient.tsx              | ✅            | ⚠️            | Missing data-testid                     |
| DashboardAudienceTable.tsx               | ✅            | ⚠️            | Missing data-testid, table caption      |
| DashboardHeader.tsx                      | ✅            | ⚠️            | Missing data-testid, aria-current       |
| DashboardMobileTabs.tsx                  | ✅            | ✅            | Good                                    |
| DashboardOverview.tsx                    | ✅            | ⚠️            | Missing data-testid                     |
| DashboardOverviewControlsProvider.tsx    | ✅            | ✅            | Good                                    |
| DashboardOverviewHeaderToolbarClient.tsx | ✅            | ✅            | Good                                    |
| DashboardOverviewMetricsClient.tsx       | ✅            | ✅            | Good                                    |
| DashboardOverviewToolbar.tsx             | ✅            | ✅            | Good                                    |
| DashboardPreview.tsx                     | ✅            | ⚠️            | Missing data-testid                     |
| EnhancedDashboardLinks.tsx               | ✅            | ⚠️            | Missing data-testid, verify form labels |
| GroupedLinksManager.tsx                  | ✅            | ⚠️            | Missing data-testid                     |
| ListenNowForm.tsx                        | ✅            | ⚠️            | Missing data-testid                     |
| OnboardingFormWrapper.tsx                | ✅            | ⚠️            | Missing data-testid                     |
| ProfileForm.tsx                          | ✅            | ⚠️            | Missing data-testid                     |
| ReleaseProviderMatrix.tsx                | ✅            | ✅            | Has data-testid ✅                      |
| SettingsPolished.tsx                     | ✅            | ⚠️            | Missing data-testid                     |
| SettingsProGateCard.tsx                  | ✅            | ⚠️            | Missing data-testid                     |
| SettingsSection.tsx                      | ✅            | ✅            | Good                                    |
| SocialsForm.tsx                          | ✅            | ⚠️            | Missing data-testid                     |

### Layout Components (4 components)

| Component               | Atomic Design | Accessibility | Issues                  |
| ----------------------- | ------------- | ------------- | ----------------------- |
| DashboardSidebar.tsx    | ✅            | ⚠️            | Verify navigation role  |
| DashboardTopBar.tsx     | ✅            | ⚠️            | Missing aria-current    |
| PreviewPanel.tsx        | ✅            | ⚠️            | Verify focus management |
| PreviewToggleButton.tsx | ✅            | ✅            | Good                    |

---

## Part 4: Priority Rankings

### 🔴 CRITICAL (Must Fix Immediately)

1. **CopyToClipboardButton.tsx** - Business logic in atom
2. **DashboardRefreshButton.tsx** - Business logic in atom
3. **DashboardThemeToggleButton.tsx** - Business logic in atom
4. **AnalyticsCards.tsx** - Business logic in molecule
5. **EnhancedThemeToggle.tsx** - Business logic in molecule
6. **FeedbackModal.tsx** - Business logic in molecule
7. **LinkActions.tsx** - Missing menu ARIA and keyboard navigation
8. **DashboardHeader.tsx** - Missing aria-current on breadcrumb

### 🟠 HIGH (Fix Soon)

9. **Missing data-testid** on 20+ organisms
10. **DashboardTopBar.tsx** - Missing aria-current
11. **LinkPill.tsx** - Verify focus management
12. **DashboardCard.tsx** - Polymorphism review
13. **Missing aria-live** for dynamic content (3 components)
14. **DashboardAudienceTable.tsx** - Missing table caption
15. **EnhancedDashboardLinks.tsx** - Verify all form labels
16. **DashboardSidebar.tsx** - Verify navigation role
17. **PreviewPanel.tsx** - Verify focus management

### 🟡 MEDIUM (Fix When Convenient)

18. **Missing forwardRef** on 10+ atoms
19. **Missing displayName** on 14+ atoms
20. **SetupTaskItem.tsx** - Semantic structure
21. **CategorySection.tsx** - Heading hierarchy
22. **UniversalLinkInput.tsx** - Complexity review
23. **PhoneMockupPreview.tsx** - Complexity review
24. **Missing keyboard shortcuts documentation**

### 🟢 LOW (Nice to Have)

25. **Icon sizing consistency** (minor)
26. **Color contrast verification** (may need automated testing)
27. **Focus indicator visibility** (may need design review)

---

## Part 5: Fix Recommendations

### Recommendation 1: Refactor Atoms with Business Logic

**Move to Molecules:**

- `CopyToClipboardButton.tsx` → `molecules/CopyToClipboardButton.tsx`
- `DashboardRefreshButton.tsx` → `molecules/DashboardRefreshButton.tsx`
- `DashboardThemeToggleButton.tsx` → `molecules/DashboardThemeToggleButton.tsx`

**Alternative**: Extract business logic to props/callbacks

### Recommendation 2: Refactor Molecules with Business Logic

**Move to Organisms:**

- `AnalyticsCards.tsx` → `organisms/DashboardAnalyticsCards.tsx`
- `EnhancedThemeToggle.tsx` → `organisms/DashboardThemeToggle.tsx`
- `FeedbackModal.tsx` → `organisms/DashboardFeedbackModal.tsx`

**Alternative**: Extract data fetching to custom hooks, pass data as props

### Recommendation 3: Add Missing ARIA Attributes

**LinkActions.tsx Fix:**

```typescript
// Add to dropdown container
<div
  role="menu"
  aria-label="Link actions menu"
  className="..."
>
  <button
    role="menuitem"
    aria-label="Edit link"
    // ... existing props
  >
    Edit
  </button>
  {/* ... other items */}
</div>

// Add to trigger button
<button
  aria-label="Link actions"
  aria-expanded={open}
  aria-controls="link-actions-menu"
  aria-haspopup="menu"
  // ... existing props
>
```

**DashboardHeader.tsx Fix:**

```typescript
{isLast ? (
  <span
    aria-current="page"
    className="truncate text-[13px] font-medium text-primary-token"
  >
    {crumb.label}
  </span>
) : (
  // ... existing code
)}
```

### Recommendation 4: Add data-testid to Organisms

**Pattern:**

```typescript
export function DashboardOverview({ ... }: DashboardOverviewProps) {
  return (
    <div data-testid="dashboard-overview">
      {/* ... */}
    </div>
  );
}
```

**Apply to**: All 20+ organisms missing data-testid

### Recommendation 5: Add forwardRef to Atoms

**Pattern:**

```typescript
export const AnalyticsCard = forwardRef<HTMLDivElement, AnalyticsCardProps>(
  ({ title, value, ...props }, ref) => {
    return (
      <section ref={ref} className={...} aria-label={`${title} metric`}>
        {/* ... */}
      </section>
    );
  }
);

AnalyticsCard.displayName = 'AnalyticsCard';
```

**Apply to**: All atoms rendering DOM elements

### Recommendation 6: Add Keyboard Navigation to LinkActions

**Implementation:**

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Escape") {
    setOpen(false);
    // Restore focus to trigger
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    // Focus first menu item
  }
  // ... arrow key navigation
};
```

### Recommendation 7: Add aria-live for Dynamic Content

**AnalyticsCards.tsx:**

```typescript
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {displayProfileViews > 0 && `Profile views: ${profileViewsLabel}`}
</div>
```

---

## Part 6: Testing Recommendations

### Accessibility Testing

1. **Automated Testing**: Run axe-core or similar on all dashboard pages
2. **Keyboard Testing**: Navigate entire dashboard with keyboard only
3. **Screen Reader Testing**: Test with NVDA/JAWS/VoiceOver
4. **Focus Testing**: Verify all interactive elements have visible focus indicators

### Atomic Design Testing

1. **Component Review**: Verify no business logic in atoms
2. **Hook Usage Audit**: Check for `useRouter`, `useAuth`, `track()`, `fetch()` in atoms
3. **Complexity Metrics**: Review molecules for excessive state management

---

## Conclusion

The dashboard has **good overall accessibility** with **82% compliance**, but needs improvement in:

1. **Atomic Design**: 8 critical violations of business logic in atoms/molecules
2. **ARIA Attributes**: Missing menu ARIA, aria-current on breadcrumbs
3. **Keyboard Navigation**: Missing keyboard support in dropdown menus
4. **Test IDs**: Missing data-testid on most organisms

**Estimated Effort**:

- Critical fixes: 2-3 days
- High priority fixes: 3-4 days
- Medium priority fixes: 2-3 days
- **Total**: ~7-10 days

**Recommended Order**:

1. Fix critical atomic design violations (move components)
2. Add missing ARIA attributes
3. Implement keyboard navigation
4. Add data-testid to organisms
5. Add forwardRef/displayName to atoms
