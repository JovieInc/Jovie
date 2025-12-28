import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  QueueListIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { AnalyticsCard } from '@/components/dashboard/atoms/AnalyticsCard';
import type { IngestionJobStatusCounts } from '@/lib/admin';

interface StatusBadgeProps {
  label: string;
  count: number;
  colorClassName: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

function StatusBadge({ label, count, colorClassName, icon: Icon }: StatusBadgeProps) {
  return (
    <div className='flex items-center gap-1.5'>
      <Icon className={`size-3.5 ${colorClassName}`} aria-hidden='true' />
      <span className='text-xs text-tertiary-token'>
        <span className='font-medium text-primary-token tabular-nums'>{count}</span>{' '}
        {label}
      </span>
    </div>
  );
}

interface IngestionJobsKpiCardProps {
  counts: IngestionJobStatusCounts;
}

export function IngestionJobsKpiCard({ counts }: IngestionJobsKpiCardProps) {
  const { pending, processing, succeeded, failed, total } = counts;

  const formattedTotal = total.toLocaleString('en-US');

  return (
    <AnalyticsCard
      title='Ingestion Jobs'
      value={formattedTotal}
      icon={QueueListIcon}
      iconClassName='text-indigo-600 dark:text-indigo-400'
      iconChipClassName='bg-indigo-500/10 dark:bg-indigo-500/15'
    >
      <div className='grid grid-cols-2 gap-x-4 gap-y-1.5'>
        <StatusBadge
          label='pending'
          count={pending}
          colorClassName='text-amber-500 dark:text-amber-400'
          icon={ClockIcon}
        />
        <StatusBadge
          label='processing'
          count={processing}
          colorClassName='text-blue-500 dark:text-blue-400'
          icon={ArrowPathIcon}
        />
        <StatusBadge
          label='succeeded'
          count={succeeded}
          colorClassName='text-emerald-500 dark:text-emerald-400'
          icon={CheckCircleIcon}
        />
        <StatusBadge
          label='failed'
          count={failed}
          colorClassName='text-rose-500 dark:text-rose-400'
          icon={ExclamationCircleIcon}
        />
      </div>
    </AnalyticsCard>
  );
}
