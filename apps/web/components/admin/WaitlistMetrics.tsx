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
    <div className='flex items-center gap-2.5 px-3 py-2.5 sm:px-4'>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          bgClass
        )}
      >
        <Icon className={cn('h-4 w-4', colorClass)} />
      </div>
      <div className='min-w-0'>
        <p className='text-[11px] font-medium text-tertiary-token uppercase tracking-wider'>
          {label}
        </p>
        <p className='text-base font-semibold text-primary-token tabular-nums leading-tight'>
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
