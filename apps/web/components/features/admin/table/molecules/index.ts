/**
 * @deprecated Import from @/components/organisms/table instead
 * Re-exports from organisms/table for backwards compatibility
 */

// Re-export from unified organisms/table location
export {
  type BulkAction,
  DisplayMenuDropdown,
  ExportCSVButton,
  type ExportCSVButtonProps,
  GroupedTableBody,
  LoadingTableBody,
  SocialLinksCell,
  TableBulkActionsToolbar,
  TableContextMenu,
  TableHeaderRow,
  type TableHeaderRowProps,
} from '@/components/organisms/table';

// Admin-specific components (kept for now)
export { TableRow, type TableRowProps } from './TableRow';
