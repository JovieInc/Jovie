# UI Library Refactoring Plan

Generated: 2025-01-XX
Status: IN_PROGRESS
Last Updated: Session 2 - Batches 1-6 complete (37 deprecated files deleted)

## Executive Summary

| Metric | Value |
|--------|-------|
| Total components | 471 |
| Storybook coverage | 25% (117/471) |
| Test coverage | 0% (0 component tests) |
| Deprecated re-exports | 43 files |
| Duplicate component names | 49 |
| Custom hooks | 50+ |
| Barrel exports (index.ts) | 68 |

### Key Issues
- **Zero component tests** - Critical gap
- **75% missing Storybook stories** - 306 components without stories
- **49 duplicate component names** - Confusing, indicates incomplete refactoring
- **43 deprecated re-export files** - Dead code candidates
- **2 atomic design violations** - Atoms importing from molecules/organisms

---

## Findings

### 🔴 Critical (Must Fix)

1. **Zero component test files** - `apps/web/components/**/*.test.tsx` = 0 files
   - Remediation: Add tests for critical path components first

2. **Duplicate component implementations** - 49 components have same filename in multiple locations
   - Examples: `Footer.tsx`, `ThemeToggle.tsx`, `UniversalLinkInput.tsx`, `ProfileShell.tsx`
   - Remediation: Consolidate to single source, update imports

3. **Atomic design violations**
   - `atoms/SidebarCollapseButton.tsx` imports from `organisms`
   - `atoms/AvatarUploadAnnouncer.tsx` imports from `molecules`
   - Remediation: Move to correct atomic level or refactor dependencies

### 🟡 Important (Should Fix)

1. **43 deprecated re-export files** - Files marked `@deprecated` that just re-export from subdirectories
   - Location: Throughout `apps/web/components/`
   - Remediation: Update all imports to use new paths, then delete deprecated files

2. **Low Storybook coverage** - Only 25% of components have stories
   - 306 components missing stories
   - Remediation: Prioritize atoms/molecules, add stories in batches

3. **Inconsistent directory structure**
   - Some refactored components use kebab-case dirs (`link-actions/`)
   - Original files use PascalCase (`LinkActions.tsx`)
   - Remediation: Standardize on kebab-case directories

4. **Mixed component organization**
   - `components/atoms/` - 47 files
   - `components/molecules/` - 40 files
   - `components/organisms/` - 58 files
   - `components/dashboard/atoms/` - 16 files
   - `components/dashboard/molecules/` - 27 files
   - `components/dashboard/organisms/` - 63 files
   - Remediation: Consider consolidating or documenting the split

### 🟢 Minor (Nice to Fix)

1. **Shared UI package underutilized** - `packages/ui/` has 27 components but many duplicates exist in `apps/web/components/`
   - Remediation: Migrate shared atoms to `packages/ui/`

2. **Some re-export files lack `@deprecated` marker**
   - Remediation: Add deprecation notices for consistency

---

## Deprecated Files Inventory

The following 43 files are marked `@deprecated` and are candidates for removal after updating imports:

### Dashboard Components
- `dashboard/DashboardTipping.tsx`
- `dashboard/DashboardAnalytics.tsx`
- `dashboard/DashboardNav.tsx`
- `dashboard/atoms/DashboardRefreshButton.tsx`
- `dashboard/atoms/CopyToClipboardButton.tsx`
- `dashboard/atoms/LinkActions.tsx`
- `dashboard/molecules/EnhancedThemeToggle.tsx`
- `dashboard/molecules/FeedbackModal.tsx`
- `dashboard/molecules/UniversalLinkInputArtistSearchMode.tsx`
- `dashboard/molecules/PhoneMockupPreview.tsx`
- `dashboard/molecules/AnalyticsCards.tsx`
- `dashboard/molecules/UniversalLinkInput.tsx`
- `dashboard/organisms/ReleaseProviderMatrix.tsx`
- `dashboard/organisms/SettingsProfileSection.tsx`
- `dashboard/organisms/AccountSettingsSection.tsx`
- `dashboard/organisms/SocialsForm.tsx`
- `dashboard/organisms/DashboardAudienceTable.tsx`
- `dashboard/organisms/ProfileForm.tsx`
- `dashboard/organisms/DashboardThemeToggle.tsx`
- `dashboard/organisms/links/LinkCategoryGrid.tsx`
- `dashboard/organisms/DashboardActivityFeed.tsx`
- `dashboard/organisms/AppleStyleOnboardingForm.tsx`
- `dashboard/organisms/ArtistSelectionForm.tsx`
- `dashboard/organisms/AudienceMemberSidebar.tsx`

### Profile Components
- `profile/ArtistContactsButton.tsx`
- `profile/AnimatedArtistPage.tsx`
- `profile/AnimatedListenInterface.tsx`
- `profile/ArtistNotificationsCTA.tsx`

### Organisms
- `organisms/ProfileShell.tsx`
- `organisms/ContactSidebar.tsx`
- `organisms/ProfileNotificationsMenu.tsx`
- `organisms/Footer.tsx`
- `organisms/UserButton.tsx`
- `organisms/Sidebar.tsx`

### Admin Components
- `admin/IngestProfileDropdown.tsx`
- `admin/AdminCreatorProfilesWithSidebar.tsx`
- `admin/AdminUsersTable.tsx`
- `admin/WaitlistTable.tsx`
- `admin/CreatorActionsMenu.tsx`

### Other
- `home/ActionDrivenProfileSectionClient.tsx`
- `atoms/ArtistAvatar.tsx`
- `auth/atoms/OtpInput.tsx`
- `site/ThemeToggle.tsx`

---

## Execution Batches

### Batch 1: Delete Deprecated Re-exports (Dashboard Atoms/Molecules)
**PR Title:** `refactor(ui): remove deprecated dashboard atom/molecule re-exports`
**Risk:** LOW
**Estimated files changed:** 15

Tasks:
- [ ] Update imports for `DashboardRefreshButton` to use `./dashboard-refresh-button`
- [ ] Update imports for `CopyToClipboardButton` to use `./copy-to-clipboard-button`
- [ ] Update imports for `LinkActions` to use `./link-actions`
- [ ] Update imports for `UniversalLinkInput` to use `./universal-link-input`
- [ ] Update imports for `UniversalLinkInputArtistSearchMode` to use `./artist-search-mode`
- [ ] Update imports for `PhoneMockupPreview` to use `./phone-mockup-preview`
- [ ] Delete deprecated re-export files
- [ ] Run typecheck, lint, build

### Batch 2: Delete Deprecated Re-exports (Dashboard Organisms)
**PR Title:** `refactor(ui): remove deprecated dashboard organism re-exports`
**Risk:** LOW
**Estimated files changed:** 20

Tasks:
- [ ] Update imports for all dashboard organism deprecated files
- [ ] Delete deprecated re-export files
- [ ] Run typecheck, lint, build

### Batch 3: Delete Deprecated Re-exports (Profile/Organisms/Admin)
**PR Title:** `refactor(ui): remove deprecated profile/organism/admin re-exports`
**Risk:** LOW
**Estimated files changed:** 20

Tasks:
- [ ] Update imports for profile components
- [ ] Update imports for organism components
- [ ] Update imports for admin components
- [ ] Delete deprecated re-export files
- [ ] Run typecheck, lint, build

### Batch 4: Fix Atomic Design Violations
**PR Title:** `refactor(ui): fix atomic design violations`
**Risk:** MEDIUM
**Estimated files changed:** 5

Tasks:
- [ ] Move `SidebarCollapseButton` from atoms to molecules (imports organisms)
- [ ] Move `AvatarUploadAnnouncer` from atoms to molecules (imports molecules)
- [ ] Update all imports
- [ ] Run typecheck, lint, build

### Batch 5: Consolidate Duplicate Components (Phase 1)
**PR Title:** `refactor(ui): consolidate duplicate Footer implementations`
**Risk:** MEDIUM
**Estimated files changed:** 10

Tasks:
- [ ] Audit all `Footer.tsx` implementations
- [ ] Determine canonical location
- [ ] Update imports
- [ ] Delete duplicates

### Batch 6: Add Storybook Stories (Atoms)
**PR Title:** `feat(storybook): add stories for core atoms`
**Risk:** LOW
**Estimated files changed:** 20

Tasks:
- [ ] Add stories for atoms without coverage
- [ ] Focus on most-used atoms first

### Batch 7: Add Component Tests (Critical Path)
**PR Title:** `test(ui): add tests for critical path components`
**Risk:** LOW
**Estimated files changed:** 10

Tasks:
- [ ] Add tests for auth components
- [ ] Add tests for profile components
- [ ] Add tests for dashboard core components

---

## Completion Checklist

- [x] Import updates for deprecated files (Batch 1-2 complete)
- [x] 37 deprecated re-export files deleted (Batch 3 + 5 + 6 complete)
- [x] Atomic design violations fixed (Batch 4 - SidebarCollapseButton moved)
- [ ] No duplicate component implementations
- [ ] ≥50% Storybook coverage
- [ ] ≥20% test coverage on critical components
- [ ] Main branch stable and deployable
- [ ] This document updated to COMPLETE

---

## Session Progress

### Session 2 (Current)
**Commits:**
1. `refactor(ui): update imports to use modular paths instead of deprecated re-exports` (12 files)
2. `refactor(ui): update more imports to use modular paths` (12 files)
3. `refactor(ui): delete 19 deprecated re-export files` (24 files changed, -357 lines)
4. `refactor(ui): fix atomic design violation - move SidebarCollapseButton to molecules`

**Batch 3 - Deleted Files:**
- molecules: UniversalLinkInput, UniversalLinkInputArtistSearchMode, PhoneMockupPreview, AnalyticsCards, EnhancedThemeToggle
- organisms: DashboardActivityFeed, DashboardAudienceTable, DashboardThemeToggle, ReleaseProviderMatrix, SettingsProfileSection, AccountSettingsSection, AudienceMemberSidebar, UserButton, Footer
- admin: WaitlistTable, AdminUsersTable, AdminCreatorProfilesWithSidebar, IngestProfileDropdown, CreatorActionsMenu

**Batch 4 - Atomic Design Fix:**
- Moved SidebarCollapseButton from atoms/ to molecules/ (imports useSidebar from organisms)

**Batch 5 - Deleted Files:**
- dashboard: DashboardAnalytics, LinkActions, SocialsForm, ProfileForm, AppleStyleOnboardingForm, ArtistSelectionForm, LinkCategoryGrid
- profile: AnimatedArtistPage, AnimatedListenInterface, ArtistContactsButton, ArtistNotificationsCTA
- organisms: ContactSidebar, ProfileShell, ProfileNotificationsMenu
- site: ThemeToggle

**Batch 6 - Deleted Files:**
- home/ActionDrivenProfileSectionClient.tsx
- auth/atoms/OtpInput.tsx
- dashboard/DashboardNav.tsx

**Remaining Deprecated Files (6 - intentionally kept):**
- `Sidebar.tsx` - macOS case-sensitivity conflict with `sidebar/` directory
- `ArtistAvatar.tsx` - Legacy wrapper for unified Avatar
- `DashboardRefreshButton.tsx` - Wrapper with business logic (router refresh)
- `CopyToClipboardButton.tsx` - Wrapper with business logic (analytics)
- `FeedbackModal.tsx` - Wrapper with business logic (analytics)
- `DashboardTipping.tsx` - Wrapper with business logic

**Blockers Found:**
- `Sidebar.tsx` cannot be deleted due to macOS case-sensitivity conflict with `sidebar/` directory
- Some deprecated files are wrappers with business logic (not pure re-exports), need careful migration

---

## Notes

- The codebase has been undergoing modular refactoring (extracting hooks into subdirectories)
- Many deprecated files are re-exports for backward compatibility
- Priority should be on removing deprecated files before adding new coverage
- `packages/ui/` should be the home for truly shared, design-system-level atoms
- **macOS case-sensitivity**: `Sidebar.tsx` and `sidebar/` conflict - keep using PascalCase import
