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
    <Card className='h-full border-subtle bg-surface-1/80 backdrop-blur-sm overflow-hidden'>
      <CardHeader>
        <CardTitle className='text-lg'>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead className='text-left text-secondary-token'>
              <tr className='border-b border-subtle/60 text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='px-2 py-2'>User</th>
                <th className='px-2 py-2'>Action</th>
                <th className='px-2 py-2'>Timestamp</th>
                <th className='px-2 py-2 text-right'>Status</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-subtle/60'>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className='px-2 py-6 text-center text-sm text-secondary-token'
                  >
                    No recent activity found.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className='hover:bg-surface-2/60'>
                    <td className='px-2 py-3 font-medium text-primary-token'>
                      {item.user}
                    </td>
                    <td className='px-2 py-3 text-secondary-token'>
                      {item.action}
                    </td>
                    <td className='px-2 py-3 text-secondary-token'>
                      {item.timestamp}
                    </td>
                    <td className='px-2 py-3 text-right'>
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
