/**
 * @deprecated Import from @/components/organisms/table instead
 * Re-exports from organisms/table for backwards compatibility
 */

// Re-export from unified organisms/table location
export {
  type BulkAction,
  ContextMenuSubmenu,
  DisplayMenuDropdown,
  ExportCSVButton,
  type ExportCSVButtonProps,
  GroupedTableBody,
  LoadingTableBody,
  ResponsiveActionsCell,
  SocialLinksCell,
  TableBulkActionsToolbar,
  TableContextMenu,
  TableHeaderRow,
  type TableHeaderRowProps,
  TablePaginationFooter,
  type TablePaginationFooterProps,
} from '@/components/organisms/table';

// Admin-specific components (kept for now)
export { TableRow, type TableRowProps } from './TableRow';
export { TableSearchBar, type TableSearchBarProps } from './TableSearchBar';
