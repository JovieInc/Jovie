/**
 * Unified Table System
 *
 * A comprehensive table component system with:
 * - Keyboard navigation (arrow keys, spacebar, enter)
 * - Virtualization for large datasets
 * - Sorting and pagination
 * - Bulk actions and row selection
 * - Search functionality
 * - Responsive design with mobile breakpoints
 * - Accessibility (ARIA roles, screen reader support)
 *
 * @example
 * ```tsx
 * import { Table } from '@/components/organisms/table';
 *
 * <Table
 *   data={rows}
 *   columns={columns}
 *   getRowId={(row) => row.id}
 *   selectable
 *   searchable
 *   pagination={paginationConfig}
 * />
 * ```
 */

export type { TableCellProps } from './atoms/TableCell';
// Atoms
export { TableCell } from './atoms/TableCell';
export type { TableCheckboxCellProps } from './atoms/TableCheckboxCell';
export { TableCheckboxCell } from './atoms/TableCheckboxCell';
export type { TableEmptyStateProps } from './atoms/TableEmptyState';
export { TableEmptyState } from './atoms/TableEmptyState';
export type { TableHeaderCellProps } from './atoms/TableHeaderCell';
export { TableHeaderCell } from './atoms/TableHeaderCell';
export type { TableRowProps } from './atoms/TableRow';
export { TableRow } from './atoms/TableRow';
export { useRowSelection } from './hooks/useRowSelection';
export type {
  UseTableKeyboardNavProps,
  UseTableKeyboardNavReturn,
} from './hooks/useTableKeyboardNav';
// Hooks
export { useTableKeyboardNav } from './hooks/useTableKeyboardNav';
export type { BulkAction } from './molecules/TableBulkActionsToolbar';
export { TableBulkActionsToolbar } from './molecules/TableBulkActionsToolbar';
export type { TableHeaderRowProps } from './molecules/TableHeaderRow';
// Molecules
export { TableHeaderRow } from './molecules/TableHeaderRow';
export type { TablePaginationFooterProps } from './molecules/TablePaginationFooter';
export { TablePaginationFooter } from './molecules/TablePaginationFooter';
export type { TableSearchBarProps } from './molecules/TableSearchBar';
export { TableSearchBar } from './molecules/TableSearchBar';
