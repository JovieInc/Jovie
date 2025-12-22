import {
  CheckCircleIcon,
  EnvelopeIcon,
  SparklesIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { WaitlistMetrics as WaitlistMetricsType } from '@/lib/admin/waitlist';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  colorClass: string;
  bgClass: string;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: MetricCardProps) {
  return (
    <div className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 sm:px-4 sm:py-3'>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10',
          bgClass
        )}
      >
        <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', colorClass)} />
      </div>
      <div className='min-w-0'>
        <p className='text-xs text-tertiary-token uppercase tracking-wide'>
          {label}
        </p>
        <p className='text-lg font-semibold text-primary-token tabular-nums sm:text-xl'>
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

interface WaitlistMetricsProps {
  metrics: WaitlistMetricsType;
}

export function WaitlistMetrics({ metrics }: WaitlistMetricsProps) {
  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4'>
      <MetricCard
        label='New'
        value={metrics.new}
        icon={SparklesIcon}
        colorClass='text-blue-600 dark:text-blue-400'
        bgClass='bg-blue-500/10 dark:bg-blue-500/15'
      />
      <MetricCard
        label='Invited'
        value={metrics.invited}
        icon={EnvelopeIcon}
        colorClass='text-indigo-600 dark:text-indigo-400'
        bgClass='bg-indigo-500/10 dark:bg-indigo-500/15'
      />
      <MetricCard
        label='Claimed'
        value={metrics.claimed}
        icon={CheckCircleIcon}
        colorClass='text-emerald-600 dark:text-emerald-400'
        bgClass='bg-emerald-500/10 dark:bg-emerald-500/15'
      />
      <MetricCard
        label='Rejected'
        value={metrics.rejected}
        icon={XCircleIcon}
        colorClass='text-rose-500 dark:text-rose-400'
        bgClass='bg-rose-500/10 dark:bg-rose-500/15'
      />
    </div>
  );
}
