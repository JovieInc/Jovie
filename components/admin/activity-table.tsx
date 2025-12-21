import { Badge, Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { useMemo } from 'react';
import { Table, type Column } from '@/components/admin/table';
import type {
  AdminActivityItem,
  AdminActivityStatus,
} from '@/lib/admin/overview';

// TODO: extend activity feed with additional admin event data.

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

interface ActivityTableProps {
  items: AdminActivityItem[];
}

export function ActivityTable({ items }: ActivityTableProps) {
  // Define table columns
  const columns: Column<AdminActivityItem>[] = useMemo(
    () => [
      {
        id: 'user',
        header: 'User',
        cell: item => (
          <span className='font-medium text-primary-token whitespace-nowrap'>
            {item.user}
          </span>
        ),
        width: 'w-[200px]',
      },
      {
        id: 'action',
        header: 'Action',
        cell: item => (
          <div>
            <span className='block truncate text-secondary-token'>
              {item.action}
            </span>
            <span className='mt-0.5 block text-xs text-tertiary-token md:hidden'>
              {item.timestamp}
            </span>
          </div>
        ),
        width: 'w-auto',
      },
      {
        id: 'timestamp',
        header: 'Timestamp',
        cell: item => (
          <span className='whitespace-nowrap text-secondary-token'>
            {item.timestamp}
          </span>
        ),
        hideOnMobile: true,
        width: 'w-[180px]',
      },
      {
        id: 'status',
        header: 'Status',
        cell: item => (
          <Badge variant={statusVariant[item.status]} size='sm'>
            {statusLabel[item.status]}
          </Badge>
        ),
        align: 'right',
        width: 'w-[140px]',
      },
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
          <Table
            data={items}
            columns={columns}
            getRowId={item => item.id}
            virtualizationThreshold={50}
            rowHeight={60}
            caption='Recent activity in the last 7 days'
            className='border-0'
          />
        </div>
      </CardContent>
    </Card>
  );
}
