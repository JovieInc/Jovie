import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import {
  ArrowRight,
  DollarSign,
  Mail,
  MousePointerClick,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

interface OutreachPipelineCardProps {
  readonly metrics: AdminFunnelMetrics;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '--';
  return `${(rate * 100).toFixed(1)}%`;
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
    <div className='flex items-center justify-between'>
      <div className='flex items-center gap-1.5'>
        <Icon className={`size-3 ${iconClassName}`} />
        <span className='text-2xs text-secondary-token'>{label}</span>
      </div>
      <span className='text-2xs font-semibold tabular-nums text-primary-token'>
        {value}
      </span>
    </div>
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
    <div className='flex-1 rounded-lg bg-surface-2 p-3'>
      <div className='flex items-center gap-1.5'>
        <Icon className={`size-3.5 ${iconClassName}`} />
        <span className='text-2xs text-tertiary-token'>{label}</span>
      </div>
      <p className='mt-1 text-xl font-semibold tabular-nums text-primary-token'>
        {value}
      </p>
      <p className='text-2xs text-secondary-token'>{detail}</p>
    </div>
  );
}

export function OutreachPipelineCard({
  metrics,
}: Readonly<OutreachPipelineCardProps>) {
  const hasOutreachData = metrics.outreachSent7d > 0;

  return (
    <Card className='h-full border-subtle bg-surface-1/80'>
      <CardHeader className='space-y-1 p-5 pb-3'>
        <div className='flex items-start justify-between gap-2'>
          <div>
            <CardTitle className='text-lg tracking-tight'>
              Outreach Pipeline
            </CardTitle>
            <p className='text-2xs text-tertiary-token'>
              Last 7 days &middot; Email &amp; DM campaigns
            </p>
          </div>
          {hasOutreachData && (
            <span className='text-app font-medium tabular-nums text-primary-token'>
              {formatPercent(metrics.claimRate)} conv.
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4 p-5 pt-0'>
        <div className='flex items-center gap-2'>
          <PipelineStep
            label='Sent'
            value={metrics.outreachSent7d.toLocaleString('en-US')}
            detail='Emails & DMs'
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
            {metrics.signups7d} signup{metrics.signups7d !== 1 ? 's' : ''} this
            week from inbound &amp; organic sources.
          </p>
        )}

        <div className='space-y-2 rounded-lg bg-surface-2 p-3'>
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
      </CardContent>
    </Card>
  );
}
