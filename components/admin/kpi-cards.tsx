import {
  ArrowTrendingDownIcon,
  BanknotesIcon,
  ClockIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { AnalyticsCard } from '@/components/dashboard/atoms/AnalyticsCard';

interface KpiCardsProps {
  mrrUsd: number;
  balanceUsd: number;
  burnRateUsd: number;
  runwayMonths: number | null;
}

export function KpiCards({
  mrrUsd,
  balanceUsd,
  burnRateUsd,
  runwayMonths,
}: KpiCardsProps) {
  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    });

  const mrrLabel = formatUsd(mrrUsd);
  const balanceLabel = formatUsd(balanceUsd);
  const burnRateLabel = formatUsd(burnRateUsd);
  const runwayLabel =
    runwayMonths == null ? '∞ mo' : `${runwayMonths.toFixed(1)} mo`;
  const runwayMetadata =
    runwayMonths == null
      ? 'Profitable at the current run rate'
      : 'Estimated months of runway';

  return (
    <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <AnalyticsCard
        title='MRR'
        value={mrrLabel}
        metadata='Monthly recurring revenue'
        icon={CurrencyDollarIcon}
        iconClassName='text-sky-600 dark:text-sky-400'
        iconChipClassName='bg-sky-500/10 dark:bg-sky-500/15'
      />

      <AnalyticsCard
        title='Balance'
        value={balanceLabel}
        metadata='Mercury checking'
        icon={BanknotesIcon}
        iconClassName='text-emerald-600 dark:text-emerald-400'
        iconChipClassName='bg-emerald-500/10 dark:bg-emerald-500/15'
      />

      <AnalyticsCard
        title='Burn rate'
        value={burnRateLabel}
        metadata='Spend in the last 30 days'
        icon={ArrowTrendingDownIcon}
        iconClassName='text-rose-500 dark:text-rose-300'
        iconChipClassName='bg-rose-500/10 dark:bg-rose-500/15'
      />

      <AnalyticsCard
        title='Runway'
        value={runwayLabel}
        metadata={runwayMetadata}
        icon={ClockIcon}
        iconClassName='text-amber-500 dark:text-amber-300'
        iconChipClassName='bg-amber-500/10 dark:bg-amber-500/15'
      />
    </div>
  );
}
