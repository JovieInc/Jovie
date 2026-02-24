import { CheckCircle2, MailCheck, UserPlus2 } from 'lucide-react';
import type { WaitlistMetrics as WaitlistMetricsType } from '@/lib/admin/waitlist';
import { cn } from '@/lib/utils';

interface MetricCardProps
  extends Readonly<{
    readonly label: string;
    readonly value: number;
    readonly icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    readonly colorClass: string;
    readonly bgClass: string;
  }> {}

function MetricCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: Readonly<MetricCardProps>) {
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

interface WaitlistMetricsProps
  extends Readonly<{
    readonly metrics: WaitlistMetricsType;
  }> {}

export function WaitlistMetrics({ metrics }: Readonly<WaitlistMetricsProps>) {
  return (
    <div
      className='grid grid-cols-1 border-b border-subtle sm:grid-cols-3'
      data-testid='admin-waitlist-content'
    >
      <div className='border-b border-subtle sm:border-b-0 sm:border-r'>
        <MetricCard
          label='New'
          value={metrics.new}
          icon={UserPlus2}
          colorClass='text-accent'
          bgClass='bg-accent/10'
        />
      </div>
      <div className='border-b border-subtle sm:border-b-0 sm:border-r'>
        <MetricCard
          label='Invited'
          value={metrics.invited}
          icon={MailCheck}
          colorClass='text-secondary-token'
          bgClass='bg-secondary/10'
        />
      </div>
      <div>
        <MetricCard
          label='Claimed'
          value={metrics.claimed}
          icon={CheckCircle2}
          colorClass='text-success-token'
          bgClass='bg-success/10'
        />
      </div>
    </div>
  );
}
