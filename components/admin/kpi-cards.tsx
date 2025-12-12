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

interface KpiCardsProps {
  mrrUsd: number;
  activeSubscribers: number;
}

function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === 'up') {
    return <ArrowUpRight className='size-4 text-emerald-500' aria-hidden />;
  }
  if (direction === 'down') {
    return <ArrowDownRight className='size-4 text-red-500' aria-hidden />;
  }
  return <Minus className='size-4 text-secondary-token' aria-hidden />;
}

export function KpiCards({ mrrUsd, activeSubscribers }: KpiCardsProps) {
  const kpiData: KpiCard[] = [
    {
      id: 'mrr',
      label: 'Monthly recurring revenue',
      value: mrrUsd.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: mrrUsd >= 1000 ? 0 : 2,
      }),
      trend: '— vs prior period',
      direction: 'flat',
    },
    {
      id: 'active-subscribers',
      label: 'Active subscribers',
      value: activeSubscribers.toLocaleString('en-US'),
      trend: '— vs prior period',
      direction: 'flat',
    },
  ];

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
      {kpiData.map(kpi => (
        <Card key={kpi.id} className='border-subtle bg-surface-1'>
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
                kpi.direction === 'up'
                  ? 'text-emerald-600 dark:text-emerald-300'
                  : null,
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
