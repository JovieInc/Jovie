import { Badge } from '@jovie/ui';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import type { AdminActivityItem, AdminActivityStatus } from '@/lib/admin/types';

const statusVariant: Record<
  AdminActivityStatus,
  'success' | 'warning' | 'error'
> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
};

const statusLabel: Record<AdminActivityStatus, string> = {
  success: 'Success',
  warning: 'Needs review',
  error: 'Error',
};

// Cell renderer functions extracted to module level to avoid nested component
// definitions (S6478).
function renderUserCell({ getValue }: CellContext<AdminActivityItem, string>) {
  return (
    <span className='font-medium text-primary-token whitespace-nowrap'>
      {getValue()}
    </span>
  );
}

function renderActionCell({
  getValue,
  row,
}: CellContext<AdminActivityItem, string>) {
  const item = row.original;
  return (
    <div>
      <span className='block truncate text-secondary-token'>{getValue()}</span>
      <span className='mt-0.5 block text-xs text-tertiary-token md:hidden'>
        {item.timestamp}
      </span>
    </div>
  );
}

function renderTimestampCell({
  getValue,
}: CellContext<AdminActivityItem, string>) {
  return (
    <span className='whitespace-nowrap text-secondary-token'>{getValue()}</span>
  );
}

function renderStatusCell(status: AdminActivityStatus) {
  return (
    <Badge variant={statusVariant[status]} size='sm'>
      {statusLabel[status]}
    </Badge>
  );
}

const columnHelper = createColumnHelper<AdminActivityItem>();

/**
 * ACTIVITY_COLUMNS — Shared column definitions for the admin Activity table.
 *
 * Used by:
 * - `ActivityTableUnified.tsx` (loaded state)
 * - `admin/activity/loading.tsx` (skeleton via `UnifiedTableSkeleton`)
 *
 * Sharing columns guarantees the skeleton and loaded states match exactly on
 * column count, column sizes, and header labels — eliminating layout shift
 * when the page streams in via Suspense.
 */
// biome-ignore lint/suspicious/noExplicitAny: columnHelper.accessor narrows per-column types; outer array must be widened for cross-type column collections.
export const ACTIVITY_COLUMNS: ColumnDef<AdminActivityItem, any>[] = [
  // User column
  columnHelper.accessor('user', {
    id: 'user',
    header: 'User',
    cell: renderUserCell,
    size: 200,
  }),

  // Action column
  columnHelper.accessor('action', {
    id: 'action',
    header: 'Action',
    cell: renderActionCell,
  }),

  // Timestamp column
  columnHelper.accessor('timestamp', {
    id: 'timestamp',
    header: 'Timestamp',
    cell: renderTimestampCell,
    size: 180,
    minSize: 150,
  }),

  // Status column
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    cell: ({ getValue }) => renderStatusCell(getValue() as AdminActivityStatus),
    size: 140,
  }),
];
