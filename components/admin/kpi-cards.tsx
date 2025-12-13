import { CurrencyDollarIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { AnalyticsCard } from '@/components/dashboard/atoms/AnalyticsCard';

interface KpiCardsProps {
  mrrUsd: number;
  activeSubscribers: number;
}

export function KpiCards({ mrrUsd, activeSubscribers }: KpiCardsProps) {
  const mrrLabel = mrrUsd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: mrrUsd >= 1000 ? 0 : 2,
  });

  const activeSubscribersLabel = activeSubscribers.toLocaleString('en-US');

  return (
    <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
      <AnalyticsCard
        title='MRR'
        value={mrrLabel}
        metadata='Monthly recurring revenue'
        icon={CurrencyDollarIcon}
        iconClassName='text-sky-600 dark:text-sky-400'
        iconChipClassName='bg-sky-500/10 dark:bg-sky-500/15'
      />

      <AnalyticsCard
        title='Subscribers'
        value={activeSubscribersLabel}
        metadata='Active subscribers'
        icon={UserGroupIcon}
        iconClassName='text-emerald-600 dark:text-emerald-400'
        iconChipClassName='bg-emerald-500/10 dark:bg-emerald-500/15'
      />
    </div>
  );
}
