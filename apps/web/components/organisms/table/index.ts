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

// Audience-specific atoms (consolidated from dashboard/audience/table/atoms)
export type { AudienceActionsCellProps } from './atoms/AudienceActionsCell';
export { AudienceActionsCell } from './atoms/AudienceActionsCell';
export type { AudienceCountryCellProps } from './atoms/AudienceCountryCell';
export { AudienceCountryCell } from './atoms/AudienceCountryCell';
export type { AudienceCreatedAtCellProps } from './atoms/AudienceCreatedAtCell';
export { AudienceCreatedAtCell } from './atoms/AudienceCreatedAtCell';
export type { AudienceDeviceCellProps } from './atoms/AudienceDeviceCell';
export { AudienceDeviceCell } from './atoms/AudienceDeviceCell';
export type { AudienceIdentificationIndicatorProps } from './atoms/AudienceIdentificationIndicator';
export { AudienceIdentificationIndicator } from './atoms/AudienceIdentificationIndicator';
export type { AudienceIntentScoreCellProps } from './atoms/AudienceIntentScoreCell';
export { AudienceIntentScoreCell } from './atoms/AudienceIntentScoreCell';
export type { AudienceLastActionCellProps } from './atoms/AudienceLastActionCell';
export { AudienceLastActionCell } from './atoms/AudienceLastActionCell';
export type { AudienceLastSeenCellProps } from './atoms/AudienceLastSeenCell';
export { AudienceLastSeenCell } from './atoms/AudienceLastSeenCell';
export type { AudienceLocationCellProps } from './atoms/AudienceLocationCell';
export { AudienceLocationCell } from './atoms/AudienceLocationCell';
export type { AudienceLtvCellProps } from './atoms/AudienceLtvCell';
export { AudienceLtvCell } from './atoms/AudienceLtvCell';
export type { AudienceMobileCardProps } from './atoms/AudienceMobileCard';
export { AudienceMobileCard } from './atoms/AudienceMobileCard';
export type { AudienceQuickActionsCellProps } from './atoms/AudienceQuickActionsCell';
export { AudienceQuickActionsCell } from './atoms/AudienceQuickActionsCell';
export type { AudienceReturningCellProps } from './atoms/AudienceReturningCell';
export { AudienceReturningCell } from './atoms/AudienceReturningCell';
export type { AudienceRowSelectionCellProps } from './atoms/AudienceRowSelectionCell';
export { AudienceRowSelectionCell } from './atoms/AudienceRowSelectionCell';
export type { AudienceSourceCellProps } from './atoms/AudienceSourceCell';
export { AudienceSourceCell } from './atoms/AudienceSourceCell';
export type { AudienceTouringBadgeProps } from './atoms/AudienceTouringBadge';
export { AudienceTouringBadge } from './atoms/AudienceTouringBadge';
export type { AudienceTypeBadgeProps } from './atoms/AudienceTypeBadge';
export { AudienceTypeBadge } from './atoms/AudienceTypeBadge';
export type { AudienceUserCellProps } from './atoms/AudienceUserCell';
export { AudienceUserCell } from './atoms/AudienceUserCell';
export type { AudienceVisitsCellProps } from './atoms/AudienceVisitsCell';
export { AudienceVisitsCell } from './atoms/AudienceVisitsCell';

// =============================================================================
// Molecules
// =============================================================================

export {
  ACTION_BAR_BUTTON_CLASS,
  ActionBar,
  ActionBarButton,
  ActionBarItem,
} from './molecules/ActionBar';
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
export {
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_CONTAINER_CLASS,
  PAGE_TOOLBAR_END_CLASS,
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PAGE_TOOLBAR_START_CLASS,
  PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
  PAGE_TOOLBAR_TAB_BUTTON_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarTabButton,
} from './molecules/PageToolbar';
export type { PageToolbarSearchFormProps } from './molecules/PageToolbarSearchForm';
export { PageToolbarSearchForm } from './molecules/PageToolbarSearchForm';
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
export type { TableSearchBarProps } from './molecules/TableSearchBar';
export { TableSearchBar } from './molecules/TableSearchBar';
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
  UseRowKeyboardOptions,
  UseRowKeyboardResult,
} from './hooks/useRowKeyboard';
export { useRowKeyboard } from './hooks/useRowKeyboard';
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
export type {
  TableStateResult,
  UseTableStateOptions,
} from './hooks/useTableState';
export { useTableState } from './hooks/useTableState';

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
