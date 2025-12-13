import { Badge, Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
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

interface ActivityTableProps {
  items: AdminActivityItem[];
}

export function ActivityTable({ items }: ActivityTableProps) {
  return (
    <Card className='h-full border-subtle bg-surface-1/80'>
      <CardHeader className='space-y-1'>
        <CardTitle className='text-lg'>Recent activity</CardTitle>
        <p className='text-xs text-secondary-token'>Last 7 days.</p>
      </CardHeader>
      <CardContent className='px-0 pt-0'>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead className='text-left text-secondary-token'>
              <tr className='border-b border-subtle text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-4 py-3'>
                  User
                </th>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-4 py-3'>
                  Action
                </th>
                <th className='sticky top-0 z-10 hidden bg-surface-1/80 px-4 py-3 md:table-cell'>
                  Timestamp
                </th>
                <th className='sticky top-0 z-10 bg-surface-1/80 px-4 py-3 text-right'>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className='px-4 py-10 text-center text-sm text-secondary-token'
                  >
                    No recent activity found.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr
                    key={item.id}
                    className='border-b border-subtle last:border-b-0 hover:bg-surface-2/60 transition-colors'
                  >
                    <td className='px-4 py-3 font-medium text-primary-token whitespace-nowrap'>
                      {item.user}
                    </td>
                    <td className='px-4 py-3 text-secondary-token'>
                      <span className='block truncate'>{item.action}</span>
                      <span className='mt-0.5 block text-xs text-tertiary-token md:hidden'>
                        {item.timestamp}
                      </span>
                    </td>
                    <td className='hidden px-4 py-3 text-secondary-token md:table-cell whitespace-nowrap'>
                      {item.timestamp}
                    </td>
                    <td className='px-4 py-3 text-right whitespace-nowrap'>
                      <Badge variant={statusVariant[item.status]} size='sm'>
                        {item.status === 'success' && 'Success'}
                        {item.status === 'warning' && 'Needs review'}
                        {item.status === 'error' && 'Error'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
