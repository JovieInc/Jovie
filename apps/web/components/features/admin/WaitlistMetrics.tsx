import { CheckCircle2, MailCheck, UserPlus2 } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    <ContentSurfaceCard className='flex items-center gap-3 bg-surface-0 px-4 py-3.5'>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          bgClass
        )}
      >
        <Icon className={cn('h-4 w-4', colorClass)} aria-hidden />
      </div>
      <div className='min-w-0'>
        <p className='text-[13px] font-[560] tracking-normal text-secondary-token'>
          {label}
        </p>
        <p className='text-[15px] font-[590] leading-tight tabular-nums text-primary-token'>
          {value.toLocaleString()}
        </p>
      </div>
    </ContentSurfaceCard>
  );
}

interface WaitlistMetricsProps {
  readonly metrics: WaitlistMetricsType;
}

export function WaitlistMetrics({ metrics }: WaitlistMetricsProps) {
  return (
    <div
      className='grid gap-3 sm:grid-cols-3'
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
