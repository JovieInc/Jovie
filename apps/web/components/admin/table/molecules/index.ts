/**
 * @deprecated Import from @/components/organisms/table instead
 * Re-exports from organisms/table for backwards compatibility
 */

// Re-export from unified organisms/table location
export {
  ContextMenuSubmenu,
  DisplayMenuDropdown,
  GroupedTableBody,
  LoadingTableBody,
  ResponsiveActionsCell,
  SocialLinksCell,
  TableContextMenu,
  TableHeaderRow,
  type TableHeaderRowProps,
  TablePaginationFooter,
  type TablePaginationFooterProps,
} from '@/components/organisms/table';

// Admin-specific components (kept for now)
export {
  ExportCSVButton,
  type ExportCSVButtonProps,
} from './ExportCSVButton';
export {
  type BulkAction,
  TableBulkActionsToolbar,
  type TableBulkActionsToolbarProps,
} from './TableBulkActionsToolbar';
export { TableRow, type TableRowProps } from './TableRow';
export { TableSearchBar, type TableSearchBarProps } from './TableSearchBar';
