import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type TrendDirection = 'up' | 'down' | 'flat';

interface KpiCard {
  id: string;
  label: string;
  value: string;
  trend: string;
  direction: TrendDirection;
}

// TODO: replace mock KPI data with real admin metrics.
const kpiData: KpiCard[] = [
  {
    id: 'total-users',
    label: 'Total users',
    value: '184,920',
    trend: '+12.3% vs last month',
    direction: 'up',
  },
  {
    id: 'new-users',
    label: 'New users (7d)',
    value: '4,281',
    trend: '+6.1% vs prior week',
    direction: 'up',
  },
  {
    id: 'dau',
    label: 'Daily active users',
    value: '38,442',
    trend: '+3.4% vs yesterday',
    direction: 'up',
  },
  {
    id: 'sessions',
    label: 'Sessions completed',
    value: '212,908',
    trend: '-1.8% vs last week',
    direction: 'down',
  },
  {
    id: 'error-rate',
    label: 'Error rate',
    value: '0.34%',
    trend: 'Flat vs last week',
    direction: 'flat',
  },
];

function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === 'up') {
    return <ArrowUpRight className='size-4 text-emerald-500' aria-hidden />;
  }
  if (direction === 'down') {
    return <ArrowDownRight className='size-4 text-red-500' aria-hidden />;
  }
  return <Minus className='size-4 text-secondary-token' aria-hidden />;
}

export function KpiCards() {
  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
      {kpiData.map(kpi => (
        <Card
          key={kpi.id}
          className='border-subtle bg-surface-1/80 backdrop-blur-sm'
        >
          <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-3'>
            <CardTitle className='text-sm font-medium text-secondary-token'>
              {kpi.label}
            </CardTitle>
            <div
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                'bg-surface-2 text-secondary-token border border-subtle'
              )}
            >
              <TrendIcon direction={kpi.direction} />
              <span>{kpi.trend}</span>
            </div>
          </CardHeader>
          <CardContent className='space-y-2'>
            <p className='text-3xl font-semibold tracking-tight text-primary-token'>
              {kpi.value}
            </p>
            <p
              className={cn(
                'text-sm font-medium',
                kpi.direction === 'up' &&
                  'text-emerald-600 dark:text-emerald-300',
                kpi.direction === 'down' && 'text-red-600 dark:text-red-300',
                kpi.direction === 'flat' && 'text-secondary-token'
              )}
            >
              {kpi.direction === 'flat'
                ? 'No significant change'
                : kpi.direction === 'up'
                  ? 'Improving'
                  : 'Needs attention'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
