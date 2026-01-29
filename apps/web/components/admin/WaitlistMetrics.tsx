import { CheckCircle, Mail, Sparkles } from 'lucide-react';
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
    <div className='flex items-center gap-3 px-3 py-3 sm:px-4'>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10',
          bgClass
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 sm:h-5 sm:w-5', colorClass)} />
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
    <div className='grid grid-cols-1 border-b border-subtle sm:grid-cols-3'>
      <div className='border-b border-subtle sm:border-b-0 sm:border-r'>
        <MetricCard
          label='New'
          value={metrics.new}
          icon={Sparkles}
          colorClass='text-blue-600 dark:text-blue-400'
          bgClass='bg-blue-500/10 dark:bg-blue-500/15'
        />
      </div>
      <div className='border-b border-subtle sm:border-b-0 sm:border-r'>
        <MetricCard
          label='Invited'
          value={metrics.invited}
          icon={Mail}
          colorClass='text-indigo-600 dark:text-indigo-400'
          bgClass='bg-indigo-500/10 dark:bg-indigo-500/15'
        />
      </div>
      <div>
        <MetricCard
          label='Claimed'
          value={metrics.claimed}
          icon={CheckCircle}
          colorClass='text-emerald-600 dark:text-emerald-400'
          bgClass='bg-emerald-500/10 dark:bg-emerald-500/15'
        />
      </div>
    </div>
  );
}
