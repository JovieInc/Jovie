/**
 * @deprecated Import from @/components/organisms/table instead
 * Re-exports from organisms/table for backwards compatibility
 */

// Re-export from unified organisms/table location
export {
  TableBadge,
  TableCell,
  type TableCellProps,
  TableEmptyState,
  type TableEmptyStateProps,
  TableHeaderCell,
  type TableHeaderCellProps,
  TableIconButton,
} from '@/components/organisms/table';

// Admin-specific component (kept for now)
export {
  TableCheckboxCell,
  type TableCheckboxCellProps,
} from './TableCheckboxCell';
