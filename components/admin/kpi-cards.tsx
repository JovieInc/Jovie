import {
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { AnalyticsCard } from '@/components/dashboard/atoms/AnalyticsCard';

interface KpiCardsProps {
  mrrUsd: number;
  waitlistCount: number;
}

export function KpiCards({ mrrUsd, waitlistCount }: KpiCardsProps) {
  const mrrLabel = mrrUsd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: mrrUsd >= 1000 ? 0 : 2,
  });

  const waitlistCountLabel = waitlistCount.toLocaleString('en-US');

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
        title='Waitlist'
        value={waitlistCountLabel}
        metadata='Total waitlist signups'
        icon={ClipboardDocumentListIcon}
        iconClassName='text-emerald-600 dark:text-emerald-400'
        iconChipClassName='bg-emerald-500/10 dark:bg-emerald-500/15'
      />
    </div>
  );
}
