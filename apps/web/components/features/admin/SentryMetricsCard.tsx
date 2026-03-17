import { AlertOctagon, Bug, Flame, Users } from 'lucide-react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { AdminSentryMetrics } from '@/lib/admin/sentry-metrics';

interface SentryMetricsCardProps {
  readonly metrics: AdminSentryMetrics;
}

interface MetricBlockProps {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconClassName: string;
  readonly label: string;
  readonly value: string;
}

function MetricBlock({
  icon: Icon,
  iconClassName,
  label,
  value,
}: Readonly<MetricBlockProps>) {
  return (
    <ContentMetricCard
      className='p-3.5'
      label={label}
      value={value}
      icon={Icon}
      iconClassName={iconClassName}
      bodyClassName='space-y-1'
      valueClassName='text-[30px] font-[620] leading-none tracking-[-0.032em] text-primary-token tabular-nums'
    />
  );
}

function formatMetric(value: number): string {
  return value.toLocaleString('en-US');
}

export function SentryMetricsCard({
  metrics,
}: Readonly<SentryMetricsCardProps>) {
  if (!metrics.isConfigured || !metrics.isAvailable) {
    return (
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader title='Sentry' className='px-5 py-3' />
        <div className='p-5 pt-4'>
          <p className='text-app text-secondary-token'>
            {metrics.isConfigured
              ? (metrics.errorMessage ??
                'Sentry metrics are temporarily unavailable. Please try again shortly.')
              : 'Sentry integration not configured. Add SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG to enable error tracking.'}
          </p>
        </div>
      </ContentSurfaceCard>
    );
  }

  const topIssueLabel =
    metrics.topIssueTitle && metrics.topIssueShortId
      ? `${metrics.topIssueShortId}: ${metrics.topIssueTitle}`
      : 'No unresolved issues in the last 24 hours.';

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <ContentSectionHeader
        title='Sentry'
        subtitle='Production errors from the last 24 hours'
        className='px-5 py-3'
      />
      <div className='space-y-4 p-5 pt-4'>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <MetricBlock
            icon={Bug}
            iconClassName='text-info'
            label='Unresolved issues'
            value={formatMetric(metrics.unresolvedIssues24h)}
          />
          <MetricBlock
            icon={Flame}
            iconClassName='text-warning'
            label='Error events'
            value={formatMetric(metrics.totalEvents24h)}
          />
          <MetricBlock
            icon={Users}
            iconClassName='text-accent'
            label='Impacted users'
            value={formatMetric(metrics.impactedUsers24h)}
          />
          <MetricBlock
            icon={AlertOctagon}
            iconClassName='text-error'
            label='Critical issues'
            value={formatMetric(metrics.criticalIssues24h)}
          />
        </div>

        <ContentSurfaceCard className='p-3.5'>
          <p className='text-[11px] font-[510] tracking-[0.04em] text-tertiary-token'>
            Top unresolved issue
          </p>
          <p
            className='mt-1 truncate text-[12px] leading-[18px] text-secondary-token'
            title={topIssueLabel}
          >
            {topIssueLabel}
          </p>
        </ContentSurfaceCard>
      </div>
    </ContentSurfaceCard>
  );
}
