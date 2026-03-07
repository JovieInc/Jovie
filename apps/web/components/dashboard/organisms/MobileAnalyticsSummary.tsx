'use client';

import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalyticsQuery } from '@/lib/queries/useDashboardAnalyticsQuery';
import { cn } from '@/lib/utils';

const numberFormatter = new Intl.NumberFormat();

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly loading: boolean;
}

function StatCard({ label, value, sub, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className='flex-1 rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
        <LoadingSkeleton
          height='h-3'
          width='w-20'
          rounded='sm'
          className='mb-1.5'
        />
        <LoadingSkeleton height='h-6' width='w-12' rounded='sm' />
      </div>
    );
  }

  return (
    <div className='flex-1 rounded-xl border border-subtle bg-surface-1 px-4 py-3'>
      <p className='text-[11px] font-medium text-secondary-token'>{label}</p>
      <div className='flex items-baseline gap-2'>
        <p className='text-xl font-bold text-primary-token tabular-nums'>
          {value}
        </p>
        {sub && (
          <span className='text-[11px] text-tertiary-token tabular-nums'>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export function MobileAnalyticsSummary() {
  const { data, isLoading, isFetching } = useDashboardAnalyticsQuery({
    range: '30d',
    view: 'full',
  });

  const loading = isLoading;
  const uniqueVisitors = data?.unique_users ?? 0;
  const captureRate = data?.capture_rate;

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 md:hidden',
        isFetching && !loading && 'opacity-60'
      )}
    >
      <StatCard
        label='Active visitors'
        value={numberFormatter.format(uniqueVisitors)}
        loading={loading}
      />
      <StatCard
        label='Returning'
        value={captureRate != null ? `${captureRate}%` : '--'}
        loading={loading}
      />
    </div>
  );
}
