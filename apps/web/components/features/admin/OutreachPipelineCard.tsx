import {
  ArrowRight,
  DollarSign,
  Mail,
  MousePointerClick,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { formatPercent } from '@/lib/admin/format';
import type { AdminFunnelMetrics } from '@/lib/admin/types';

interface OutreachPipelineCardProps {
  readonly metrics: AdminFunnelMetrics;
}

function formatDollarPerOutreach(value: number | null): string {
  if (value === null) return '--';
  return `$${value.toFixed(2)}`;
}

interface ConversionMetricProps {
  readonly label: string;
  readonly value: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconClassName: string;
}

function ConversionMetric({
  label,
  value,
  icon: Icon,
  iconClassName,
}: ConversionMetricProps) {
  return (
    <ContentMetricRow
      label={label}
      value={value}
      icon={Icon}
      iconClassName={iconClassName}
      className='rounded-md px-2.5 py-2'
      labelClassName='text-xs font-[500] text-secondary-token'
      valueClassName='text-xs font-semibold text-primary-token tabular-nums'
    />
  );
}

interface PipelineStepProps {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconClassName: string;
}

function PipelineStep({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName,
}: PipelineStepProps) {
  return (
    <ContentMetricCard
      className='flex-1 p-3'
      label={label}
      value={value}
      subtitle={detail}
      icon={Icon}
      iconClassName={iconClassName}
      valueClassName='text-[24px] font-[620] leading-none tracking-[-0.028em] text-primary-token tabular-nums'
      subtitleClassName='text-2xs leading-[16px] text-secondary-token'
    />
  );
}

export function OutreachPipelineCard({
  metrics,
}: Readonly<OutreachPipelineCardProps>) {
  const hasOutreachData = metrics.outreachSent7d > 0;

  return (
    <ContentSurfaceCard className='h-full overflow-hidden'>
      <ContentSectionHeader
        title='Outreach Pipeline'
        subtitle='Last 7 days · Email & DM campaigns'
        actions={
          hasOutreachData ? (
            <span className='text-xs font-semibold tabular-nums text-secondary-token'>
              {formatPercent(metrics.claimRate)} conv.
            </span>
          ) : null
        }
        className='min-h-0 px-5 py-4'
        actionsClassName='shrink-0'
      />
      <div className='space-y-4 px-5 py-4'>
        <div className='flex items-center gap-2'>
          <PipelineStep
            label='Contacted'
            value={metrics.outreachSent7d.toLocaleString('en-US')}
            detail='Queued emails & sent DMs'
            icon={Mail}
            iconClassName='text-info'
          />

          <ArrowRight
            className='size-4 shrink-0 text-tertiary-token'
            aria-hidden='true'
          />

          <PipelineStep
            label='Clicked'
            value={metrics.claimClicks7d.toLocaleString('en-US')}
            detail='Claim link clicks'
            icon={MousePointerClick}
            iconClassName='text-accent'
          />
        </div>

        {metrics.signups7d > 0 && metrics.outreachSent7d === 0 && (
          <p className='text-2xs text-secondary-token'>
            {metrics.signups7d} signup{metrics.signups7d === 1 ? '' : 's'} this
            week from inbound &amp; organic sources.
          </p>
        )}

        <div className='space-y-2 rounded-lg bg-surface-0 p-3'>
          <p className='text-2xs font-medium text-tertiary-token'>
            Conversion rates
          </p>
          <ConversionMetric
            label='Outreach → Signup'
            value={formatPercent(metrics.outreachToSignupRate)}
            icon={TrendingUp}
            iconClassName='text-info'
          />
          <ConversionMetric
            label='Signup → Paid'
            value={formatPercent(metrics.signupToPaidRate)}
            icon={UserCheck}
            iconClassName='text-success'
          />
          <ConversionMetric
            label='$/outreach'
            value={formatDollarPerOutreach(metrics.dollarPerOutreach)}
            icon={DollarSign}
            iconClassName='text-accent'
          />
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
