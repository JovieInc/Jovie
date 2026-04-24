'use client';

import { Badge } from '@jovie/ui';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  UnifiedTable,
} from '@/components/organisms/table';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import type { AdminActivityItem, AdminActivityStatus } from '@/lib/admin/types';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';

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

// Cell renderer functions extracted to module level to avoid nested component definitions (S6478)
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

interface ActivityTableUnifiedProps {
  readonly items: AdminActivityItem[];
}

/** Standard row class for activity table */
const getRowClassName = () => 'group hover:bg-(--linear-row-hover)';

const columnHelper = createColumnHelper<AdminActivityItem>();

// Column definitions are shared between the live table and its skeleton so that
// loading and loaded states render identical row geometry (no layout shift when
// the streamed data arrives).
const ACTIVITY_COLUMNS: ColumnDef<AdminActivityItem, any>[] = [
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

// Per-column skeleton geometry, sized to match each cell's loaded content so the
// skeleton row collapses into the real row without horizontal jitter.
const ACTIVITY_SKELETON_COLUMN_CONFIG = [
  { width: '120px', variant: 'text' as const }, // User (handle)
  { width: '240px', variant: 'text' as const }, // Action
  { width: '110px', variant: 'text' as const }, // Timestamp
  { width: '64px', variant: 'badge' as const }, // Status badge
];

const ACTIVITY_TABLE_CLASSNAME =
  'text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-[10px] [&_thead_th]:tracking-[0.07em]';

const ACTIVITY_SUBHEADER = (
  <AdminTableSubheader
    start={<p className={PAGE_TOOLBAR_META_TEXT_CLASS}>Last 7 days.</p>}
  />
);

const ACTIVITY_CONTAINER_CLASSNAME =
  'h-full border-0 bg-(--linear-app-content-surface)';

export function ActivityTableUnified({
  items,
}: Readonly<ActivityTableUnifiedProps>) {
  // Bind the shared column definitions through useMemo so React treats the
  // reference as stable across renders.
  const columns = useMemo<ColumnDef<AdminActivityItem, any>[]>(
    () => ACTIVITY_COLUMNS,
    []
  );

  return (
    <div
      className={ACTIVITY_CONTAINER_CLASSNAME}
      data-testid='admin-activity-content'
    >
      {ACTIVITY_SUBHEADER}
      <div className='overflow-x-auto'>
        <UnifiedTable
          data={items}
          columns={columns}
          isLoading={false}
          emptyState={
            <div className='flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-secondary-token'>
              <Activity className='h-6 w-6' />
              <div>
                <div className='font-medium text-primary-token'>
                  No recent activity
                </div>
                <div className='text-xs text-secondary-token'>
                  Activity from the last 7 days will appear here.
                </div>
              </div>
            </div>
          }
          getRowId={row => row.id}
          getRowClassName={getRowClassName}
          enableVirtualization={true}
          minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
          className={ACTIVITY_TABLE_CLASSNAME}
        />
      </div>
    </div>
  );
}

interface ActivityTableSkeletonProps {
  /**
   * How many skeleton rows to render. Should approximate the typical loaded
   * page so the page doesn't visibly grow when real data streams in.
   * @default 8
   */
  readonly rows?: number;
}

/**
 * Loading skeleton that mirrors `ActivityTableUnified` exactly — same chrome,
 * same `UnifiedTable` primitives, same column count, same per-column skeleton
 * widths, and the same row height token. Rendering through the real table
 * primitives is what guarantees zero layout shift when the live table replaces
 * it during streaming SSR / Suspense resolution.
 */
export function ActivityTableSkeleton({
  rows = 8,
}: Readonly<ActivityTableSkeletonProps> = {}) {
  const columns = useMemo<ColumnDef<AdminActivityItem, any>[]>(
    () => ACTIVITY_COLUMNS,
    []
  );

  return (
    <div className={ACTIVITY_CONTAINER_CLASSNAME} aria-busy='true'>
      {ACTIVITY_SUBHEADER}
      <div className='overflow-x-auto'>
        <UnifiedTable<AdminActivityItem>
          data={[]}
          columns={columns}
          isLoading
          skeletonRows={rows}
          skeletonColumnConfig={ACTIVITY_SKELETON_COLUMN_CONFIG}
          minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
          className={ACTIVITY_TABLE_CLASSNAME}
        />
      </div>
    </div>
  );
}
