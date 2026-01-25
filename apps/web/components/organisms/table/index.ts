/**
 * Unified Table System
 *
 * A comprehensive table component system with:
 * - TanStack Table integration for powerful table features
 * - TanStack Virtual for performance with large datasets
 * - Keyboard navigation (arrow keys, spacebar, enter)
 * - Virtualization for large datasets (auto-enabled for 20+ rows)
 * - Sorting and pagination
 * - Bulk actions and row selection
 * - Search functionality
 * - Context menus
 * - Loading skeletons
 * - Responsive design with mobile breakpoints
 * - Accessibility (ARIA roles, screen reader support)
 *
 * @example
 * ```tsx
 * // Modern approach with UnifiedTable (recommended)
 * import { UnifiedTable } from '@/components/organisms/table';
 *
 * const columns: ColumnDef<User>[] = [
 *   { accessorKey: 'name', header: 'Name' },
 *   { accessorKey: 'email', header: 'Email' },
 * ];
 *
 * <UnifiedTable
 *   data={users}
 *   columns={columns}
 *   isLoading={isLoading}
 *   rowSelection={rowSelection}
 *   onRowSelectionChange={setRowSelection}
 * />
 * ```
 */

// =============================================================================
// Atoms
// =============================================================================

export { ActionsCell } from './atoms/ActionsCell';
export { AvatarCell } from './atoms/AvatarCell';
export { DateCell } from './atoms/DateCell';
export { GroupHeader } from './atoms/GroupHeader';
export { SkeletonCell } from './atoms/SkeletonCell';
export { SkeletonRow } from './atoms/SkeletonRow';
export { TableBadge } from './atoms/TableBadge';
export type { TableCellProps } from './atoms/TableCell';
export { TableCell } from './atoms/TableCell';
export type {
  TableCheckboxCellLegacyProps,
  TableCheckboxCellProps,
  TableCheckboxCellTanStackProps,
} from './atoms/TableCheckboxCell';
export { TableCheckboxCell } from './atoms/TableCheckboxCell';
export type { TableCountBadgeProps } from './atoms/TableCountBadge';
export { TableCountBadge } from './atoms/TableCountBadge';
export type { TableEmptyStateProps } from './atoms/TableEmptyState';
export { TableEmptyState } from './atoms/TableEmptyState';
export type { TableHeaderCellProps } from './atoms/TableHeaderCell';
export { TableHeaderCell } from './atoms/TableHeaderCell';
export { TableIconButton } from './atoms/TableIconButton';
export type { TableRowProps } from './atoms/TableRow';
export { TableRow } from './atoms/TableRow';

// =============================================================================
// Molecules
// =============================================================================

export type { AdminPageSizeSelectProps } from './AdminPageSizeSelect';
export { AdminPageSizeSelect } from './AdminPageSizeSelect';
export { ContextMenuSubmenu } from './molecules/ContextMenuSubmenu';
export type { ViewMode } from './molecules/DisplayMenuDropdown';
export { DisplayMenuDropdown } from './molecules/DisplayMenuDropdown';
export type { ExportCSVButtonProps } from './molecules/ExportCSVButton';
export { ExportCSVButton } from './molecules/ExportCSVButton';
export { GroupedTableBody } from './molecules/GroupedTableBody';
export type {
  BulkAction as HeaderBulkAction,
  HeaderBulkActionsProps,
} from './molecules/HeaderBulkActions';
export { HeaderBulkActions } from './molecules/HeaderBulkActions';
export { LoadingTableBody } from './molecules/LoadingTableBody';
export { ResponsiveActionsCell } from './molecules/ResponsiveActionsCell';
export { SocialLinksCell } from './molecules/SocialLinksCell';
export type { BulkAction } from './molecules/TableBulkActionsToolbar';
export { TableBulkActionsToolbar } from './molecules/TableBulkActionsToolbar';
export type { ContextMenuItemType } from './molecules/TableContextMenu';
export {
  convertContextMenuItems,
  convertToCommonDropdownItems,
  TableContextMenu,
} from './molecules/TableContextMenu';
export type { TableHeaderRowProps } from './molecules/TableHeaderRow';
export { TableHeaderRow } from './molecules/TableHeaderRow';
export type { TablePaginationFooterProps } from './molecules/TablePaginationFooter';
export { TablePaginationFooter } from './molecules/TablePaginationFooter';
export type { TableSearchBarProps } from './molecules/TableSearchBar';
export { TableSearchBar } from './molecules/TableSearchBar';
export type { TableStandardFooterProps } from './molecules/TableStandardFooter';
export { TableStandardFooter } from './molecules/TableStandardFooter';
export type {
  BulkAction as TableStandardToolbarBulkAction,
  TableStandardToolbarProps,
} from './molecules/TableStandardToolbar';
export { TableStandardToolbar } from './molecules/TableStandardToolbar';

// =============================================================================
// Organisms
// =============================================================================

export type { UnifiedTableProps } from './organisms/UnifiedTable';
export { UnifiedTable } from './organisms/UnifiedTable';

// =============================================================================
// Hooks
// =============================================================================

export type {
  HeaderCheckboxState,
  UseRowSelectionResult,
} from './hooks/useRowSelection';
export { useRowSelection } from './hooks/useRowSelection';
export type {
  UseStableSelectionRefsOptions,
  UseStableSelectionRefsResult,
} from './hooks/useStableSelectionRefs';
export { useStableSelectionRefs } from './hooks/useStableSelectionRefs';
export type {
  UseTableKeyboardNavProps,
  UseTableKeyboardNavReturn,
} from './hooks/useTableKeyboardNav';
export { useTableKeyboardNav } from './hooks/useTableKeyboardNav';

// =============================================================================
// Utilities & Hooks
// =============================================================================

export type {
  SelectionColumnOptions,
  SelectionColumnRenderers,
} from './utils/createSelectionColumnFactory';
export { createSelectionColumnFactory } from './utils/createSelectionColumnFactory';
export { useTableGrouping } from './utils/useTableGrouping';

// =============================================================================
// Styles
// =============================================================================

export { cn, presets } from './table.styles';
