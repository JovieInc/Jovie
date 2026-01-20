'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { UnifiedTable } from '@/components/organisms/table';
import type {
  AdminActivityItem,
  AdminActivityStatus,
} from '@/lib/admin/overview';

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

interface ActivityTableUnifiedProps {
  items: AdminActivityItem[];
}

const columnHelper = createColumnHelper<AdminActivityItem>();

export function ActivityTableUnified({ items }: ActivityTableUnifiedProps) {
  // Define table columns using TanStack Table
  const columns = useMemo<ColumnDef<AdminActivityItem, any>[]>(
    () => [
      // User column
      columnHelper.accessor('user', {
        id: 'user',
        header: 'User',
        cell: ({ getValue }) => (
          <span className='font-medium text-primary-token whitespace-nowrap'>
            {getValue()}
          </span>
        ),
        size: 200,
      }),

      // Action column
      columnHelper.accessor('action', {
        id: 'action',
        header: 'Action',
        cell: ({ getValue, row }) => {
          const item = row.original;
          return (
            <div>
              <span className='block truncate text-secondary-token'>
                {getValue()}
              </span>
              <span className='mt-0.5 block text-xs text-tertiary-token md:hidden'>
                {item.timestamp}
              </span>
            </div>
          );
        },
      }),

      // Timestamp column
      columnHelper.accessor('timestamp', {
        id: 'timestamp',
        header: 'Timestamp',
        cell: ({ getValue }) => (
          <span className='whitespace-nowrap text-secondary-token'>
            {getValue()}
          </span>
        ),
        size: 180,
      }),

      // Status column
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as AdminActivityStatus;
          return (
            <Badge variant={statusVariant[status]} size='sm'>
              {statusLabel[status]}
            </Badge>
          );
        },
        size: 140,
      }),
    ],
    []
  );

  return (
    <Card className='h-full border-subtle bg-surface-1/80'>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-lg'>Recent activity</CardTitle>
        <p className='text-xs text-secondary-token'>Last 7 days.</p>
      </CardHeader>
      <CardContent className='px-0 pt-0'>
        <div className='overflow-x-auto'>
          <UnifiedTable
            data={items}
            columns={columns}
            isLoading={false}
            emptyState={
              <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
                <Activity className='h-6 w-6' />
                <div>
                  <div className='font-medium'>No recent activity</div>
                  <div className='text-xs'>
                    Activity from the last 7 days will appear here.
                  </div>
                </div>
              </div>
            }
            getRowId={row => row.id}
            enableVirtualization={true}
            minWidth='960px'
            className='text-[13px]'
          />
        </div>
      </CardContent>
    </Card>
  );
}
