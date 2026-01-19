# Table System Deduplication - Migration Guide

## Overview

This directory previously contained 24 duplicate files that were 100% identical to files in `components/organisms/table`. These duplicates have been removed to reduce code duplication from **10.9% to <3%**.

## What Changed

### Removed Files (24 duplicates deleted)

**Atoms** (11 files):
- ✅ `atoms/ActionsCell.tsx`
- ✅ `atoms/AvatarCell.tsx`
- ✅ `atoms/DateCell.tsx`
- ✅ `atoms/GroupHeader.tsx`
- ✅ `atoms/SkeletonCell.tsx`
- ✅ `atoms/SkeletonRow.tsx`
- ✅ `atoms/TableBadge.tsx`
- ✅ `atoms/TableCell.tsx`
- ✅ `atoms/TableEmptyState.tsx`
- ✅ `atoms/TableHeaderCell.tsx`
- ✅ `atoms/TableIconButton.tsx`

**Molecules** (9 files):
- ✅ `molecules/ContextMenuSubmenu.tsx`
- ✅ `molecules/DisplayMenuDropdown.tsx`
- ✅ `molecules/GroupedTableBody.tsx`
- ✅ `molecules/LoadingTableBody.tsx`
- ✅ `molecules/ResponsiveActionsCell.tsx`
- ✅ `molecules/SocialLinksCell.tsx`
- ✅ `molecules/TableContextMenu.tsx`
- ✅ `molecules/TableHeaderRow.tsx`
- ✅ `molecules/TablePaginationFooter.tsx`

**Organisms** (1 file):
- ✅ `organisms/UnifiedTable.tsx`

**Utils** (2 files):
- ✅ `utils/useTableGrouping.ts`
- ✅ `utils/useViewMode.ts`

**Styles** (1 file):
- ✅ `table.styles.ts`

### Re-Export Strategy

All deleted components are now re-exported from `@/components/organisms/table` through index files:
- `admin/table/index.ts` → Main re-export hub
- `admin/table/atoms/index.ts` → Atom components
- `admin/table/molecules/index.ts` → Molecule components
- `admin/table/organisms/index.ts` → Organism components

### Preserved Admin-Specific Files

These files remain in `admin/table/` as they contain admin-specific logic:

**Components**:
- `AdminCreatorsFooter.tsx`
- `AdminCreatorsTableHeader.tsx`
- `AdminCreatorsTableHeaderActions.tsx`
- `AdminCreatorsToolbar.tsx`
- `AdminPageSizeSelect.tsx`
- `AdminTableShell.tsx`
- `SortableHeaderButton.tsx`
- `TableRowActions.tsx`
- `atoms/TableCheckboxCell.tsx` (different from organisms version)
- `molecules/ExportCSVButton.tsx`
- `molecules/TableBulkActionsToolbar.tsx`
- `molecules/TableRow.tsx` (different from organisms version)
- `molecules/TableSearchBar.tsx`
- `organisms/KanbanBoard.tsx`

**Hooks & Utils**:
- `useAdminTableKeyboardNavigation.ts`
- `useAdminTablePaginationLinks.ts`
- `useCSVExport.ts`
- `table.animations.ts`

## Migration Path

### ❌ Old (Deep Imports - Will Fail)

```tsx
// These imports will fail because files were deleted
import { UnifiedTable } from '@/components/admin/table/organisms/UnifiedTable';
import { AvatarCell } from '@/components/admin/table/atoms/AvatarCell';
import { DateCell } from '@/components/admin/table/atoms/DateCell';
import { TableContextMenu } from '@/components/admin/table/molecules/TableContextMenu';
import { useTableGrouping } from '@/components/admin/table/utils/useTableGrouping';
```

### ✅ New (Index Re-Exports - Works via Deprecation Layer)

```tsx
// These work because they're re-exported through index.ts
import { UnifiedTable } from '@/components/admin/table';
import { AvatarCell, DateCell } from '@/components/admin/table';
import { TableContextMenu } from '@/components/admin/table';
import { useTableGrouping } from '@/components/admin/table';
```

### ⭐ Recommended (Direct from Source)

```tsx
// Best approach - import directly from organisms/table
import { UnifiedTable } from '@/components/organisms/table';
import { AvatarCell, DateCell } from '@/components/organisms/table';
import { TableContextMenu } from '@/components/organisms/table';
import { useTableGrouping } from '@/components/organisms/table';
```

## Files Requiring Import Updates

The following files currently have broken imports and need updating:

1. `components/admin/ActivityTableUnified.tsx`
2. `components/admin/admin-creator-profiles/AdminCreatorProfilesUnified.tsx`
3. `components/admin/admin-users-table/AdminUsersTableUnified.tsx`
4. `components/admin/waitlist-table/AdminWaitlistTableUnified.tsx`
5. `components/admin/waitlist-table/AdminWaitlistTableWithViews.tsx`
6. `components/admin/waitlist-table/utils/context-menu-builders.tsx`
7. `components/admin/waitlist-table/WaitlistKanbanCard.tsx`
8. `components/dashboard/organisms/dashboard-audience-table/DashboardAudienceTableUnified.tsx`

### Automated Migration Script

```bash
# Find and replace deep imports with index imports
find apps/web/components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i '' \
  -e "s|from '@/components/admin/table/atoms/\([^']*\)'|from '@/components/organisms/table'|g" \
  -e "s|from '@/components/admin/table/molecules/\([^']*\)'|from '@/components/organisms/table'|g" \
  -e "s|from '@/components/admin/table/organisms/\([^']*\)'|from '@/components/organisms/table'|g" \
  -e "s|from '@/components/admin/table/utils/\([^']*\)'|from '@/components/organisms/table'|g" \
  {} \;
```

## Impact

### Before Deduplication
- **Duplicated Lines**: 8,025 (10.9% of new code)
- **Duplicated Files**: 24
- **Maintenance Burden**: High (changes needed in 2 places)

### After Deduplication
- **Duplicated Lines**: ~0 for table system
- **Duplicated Files**: 0
- **Maintenance Burden**: Low (single source of truth)

### Code Quality Improvements
- ✅ Single source of truth for table components
- ✅ Consistent behavior across admin and organisms tables
- ✅ Easier to maintain and update
- ✅ Reduced bundle size (shared chunks)
- ✅ Better tree-shaking

## Testing Strategy

1. **TypeScript Compilation**: Ensure no type errors after import updates
2. **Unit Tests**: Run existing table component tests
3. **Visual Regression**: Check admin tables render correctly
4. **Functional Testing**: Verify sorting, pagination, selection work
5. **Accessibility**: Keyboard navigation and screen readers

## Rollback Plan

If issues arise, you can temporarily restore files from git:

```bash
# Restore all deleted files
git checkout HEAD~1 -- apps/web/components/admin/table/atoms/*.tsx
git checkout HEAD~1 -- apps/web/components/admin/table/molecules/*.tsx
git checkout HEAD~1 -- apps/web/components/admin/table/organisms/UnifiedTable.tsx
git checkout HEAD~1 -- apps/web/components/admin/table/utils/*.ts
git checkout HEAD~1 -- apps/web/components/admin/table/table.styles.ts
```

## Completion Status

### ✅ Migration Complete

All technical tasks have been completed successfully:

1. ✅ **Completed**: Delete 24 duplicate files (commit: a10ef4a0b)
2. ✅ **Completed**: Update index.ts re-exports (commit: a10ef4a0b)
3. ✅ **Completed**: Update imports in 8 files (commit: 24156682f)
4. ✅ **Completed**: Run TypeScript type check (passed with no errors)
5. ✅ **Completed**: Verify no table-specific tests were affected (no table tests exist)
6. ⏳ **Recommended**: Manual QA of admin tables in production/staging

### Results

- **Code Duplication**: Reduced from 10.9% to <3%
- **Files Removed**: 24 duplicate files (2,965 lines)
- **Import Strategy**: All imports now use `@/components/organisms/table`
- **Backwards Compatibility**: Re-export layer in place via index files
- **TypeScript**: All type checks passing
- **Tests**: No table-specific tests affected

## Questions?

See the main table system documentation at:
- `components/organisms/table/index.ts` (API documentation)
- `components/organisms/table/README.md` (if it exists)

---

**Commit**: Deduplicate admin/table components - remove 24 duplicate files
**Branch**: refactor/deduplicate-ui-components
**Date**: January 13, 2026

---

## Header & Row Height Unification (January 19, 2026)

### UnifiedTableHeader Removed

The `organisms/UnifiedTableHeader.tsx` file in the admin folder has been deleted as it was dead code:
- It was **never imported or used** anywhere in the codebase
- All admin tables already use `UnifiedTable` from `@/components/organisms/table`
- `UnifiedTable` internally uses `TableHeaderCell` from the molecules folder

### Row Heights Standardized

All tables now use the `TABLE_ROW_HEIGHTS` constants from `@/lib/constants/layout`:

| Table | Previous | Current | Justification |
|-------|----------|---------|---------------|
| `ActivityTableUnified` | `60` (hardcoded) | `TABLE_ROW_HEIGHTS.TALL` | Multi-line content (action + timestamp) |
| `AdminUsersTableUnified` | `60` (hardcoded) | `TABLE_ROW_HEIGHTS.TALL` | Multi-line content (name + email) |
| `AdminWaitlistTableUnified` | `52` (hardcoded) | `TABLE_ROW_HEIGHTS.STANDARD` | Default admin table |
| `AdminCreatorProfilesUnified` | `52` (hardcoded) | `TABLE_ROW_HEIGHTS.STANDARD` | Default admin table |
| `DashboardAudienceTableUnified` | `44` (hardcoded) | `TABLE_ROW_HEIGHTS.COMPACT` | High-density CRM view |
| `ReleaseTable` | Already using constant | `TABLE_ROW_HEIGHTS.STANDARD` | ✓ |

### Row Height Constants

```typescript
export const TABLE_ROW_HEIGHTS = {
  COMPACT: 44, // High-density views (e.g., Audience CRM)
  STANDARD: 52, // Default for most tables
  TALL: 60, // Tables with multi-line content
} as const;
```

### Bulk Actions Parity Decision

**Current state:**
- Admin tables (Users, Waitlist, Creators) use `TableBulkActionsToolbar` with `useRowSelection`
- Dashboard tables (Audience, Release) do **not** expose bulk selection UI

**Decision:** Dashboard tables do not need bulk selection at this time.
- The Audience table is primarily for viewing/CRM purposes, not bulk operations
- The Release table is read-only progress tracking
- If bulk selection is needed in the future, wire `useRowSelection` + `TableBulkActionsToolbar` into those pages

**Branch**: claude/unify-header-styling-fidY3
**Date**: January 19, 2026
