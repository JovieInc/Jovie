import { CheckCircle2, MailCheck, UserPlus2 } from 'lucide-react';
import type { WaitlistMetrics as WaitlistMetricsType } from '@/lib/admin/waitlist';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  readonly label: string;
  readonly value: number;
  readonly icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  readonly colorClass: string;
  readonly bgClass: string;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: MetricCardProps) {
  return (
    <div className='flex items-center gap-2.5 px-3 py-2.5'>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          bgClass
        )}
      >
        <Icon className={cn('h-3.5 w-3.5', colorClass)} />
      </div>
      <div className='min-w-0'>
        <p className='text-[10px] font-semibold text-tertiary-token uppercase tracking-wide'>
          {label}
        </p>
        <p className='text-sm font-semibold text-primary-token tabular-nums leading-tight'>
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

interface WaitlistMetricsProps {
  readonly metrics: WaitlistMetricsType;
}

export function WaitlistMetrics({ metrics }: WaitlistMetricsProps) {
  return (
    <div
      className='grid grid-cols-3 divide-x divide-subtle rounded-md border border-subtle'
      data-testid='admin-waitlist-content'
    >
      <MetricCard
        label='New'
        value={metrics.new}
        icon={UserPlus2}
        colorClass='text-accent'
        bgClass='bg-accent/10'
      />
      <MetricCard
        label='Invited'
        value={metrics.invited}
        icon={MailCheck}
        colorClass='text-secondary-token'
        bgClass='bg-secondary/10'
      />
      <MetricCard
        label='Claimed'
        value={metrics.claimed}
        icon={CheckCircle2}
        colorClass='text-success-token'
        bgClass='bg-success/10'
      />
    </div>
  );
}
