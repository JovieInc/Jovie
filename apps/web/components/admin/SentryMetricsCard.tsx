import { AlertOctagon, Bug, Flame, Users } from 'lucide-react';
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
    <ContentSurfaceCard className='space-y-2 p-3'>
      <p className='flex items-center gap-2 text-2xs text-secondary-token'>
        <Icon className={`h-4 w-4 ${iconClassName}`} />
        {label}
      </p>
      <p className='text-2xl font-semibold text-primary-token tabular-nums'>
        {value}
      </p>
    </ContentSurfaceCard>
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
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
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

        <p
          className='truncate text-2xs text-tertiary-token'
          title={topIssueLabel}
        >
          {topIssueLabel}
        </p>
      </div>
    </ContentSurfaceCard>
  );
}
