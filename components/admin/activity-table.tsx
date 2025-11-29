import { Badge, Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';

type ActivityStatus = 'success' | 'warning' | 'error';

interface ActivityRow {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  status: ActivityStatus;
}

// TODO: replace mock activity feed with real admin event data.
const activity: ActivityRow[] = [
  {
    id: '1',
    user: '@lin.j',
    action: 'Created workspace',
    timestamp: '2024-07-01 14:22 UTC',
    status: 'success',
  },
  {
    id: '2',
    user: '@aurora.music',
    action: 'Updated billing email',
    timestamp: '2024-07-01 13:48 UTC',
    status: 'success',
  },
  {
    id: '3',
    user: '@signal-labs',
    action: 'API key rotated',
    timestamp: '2024-07-01 13:21 UTC',
    status: 'warning',
  },
  {
    id: '4',
    user: '@noah-dev',
    action: 'Failed payout attempt',
    timestamp: '2024-07-01 12:57 UTC',
    status: 'error',
  },
  {
    id: '5',
    user: '@yvette',
    action: 'Profile published',
    timestamp: '2024-07-01 12:44 UTC',
    status: 'success',
  },
];

const statusVariant: Record<ActivityStatus, 'success' | 'warning' | 'error'> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
};

export function ActivityTable() {
  return (
    <Card className='h-full border-subtle bg-surface-1/80 backdrop-blur-sm'>
      <CardHeader>
        <CardTitle className='text-lg'>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-sm'>
            <thead className='text-left text-secondary-token'>
              <tr className='border-b border-subtle text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='px-2 py-2'>User</th>
                <th className='px-2 py-2'>Action</th>
                <th className='px-2 py-2'>Timestamp</th>
                <th className='px-2 py-2 text-right'>Status</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-subtle'>
              {activity.map(item => (
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
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
