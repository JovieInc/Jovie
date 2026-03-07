import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { AlertOctagon, Bug, Flame, Users } from 'lucide-react';
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
    <div className='rounded-lg bg-surface-2 p-3'>
      <p className='flex items-center gap-2 text-2xs text-secondary-token'>
        <Icon className={`h-4 w-4 ${iconClassName}`} />
        {label}
      </p>
      <p className='mt-2 text-2xl font-semibold text-primary-token tabular-nums'>
        {value}
      </p>
    </div>
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
      <Card className='border-subtle bg-transparent'>
        <CardHeader className='p-5 pb-2'>
          <CardTitle className='text-lg tracking-tight'>Sentry</CardTitle>
        </CardHeader>
        <CardContent className='p-5 pt-0'>
          <p className='text-app text-secondary-token'>
            {metrics.isConfigured
              ? 'Sentry metrics are temporarily unavailable. Please try again shortly.'
              : 'Sentry integration not configured. Add SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG to enable error tracking.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const topIssueLabel =
    metrics.topIssueTitle && metrics.topIssueShortId
      ? `${metrics.topIssueShortId}: ${metrics.topIssueTitle}`
      : 'No unresolved issues in the last 24 hours.';

  return (
    <Card className='border-subtle bg-transparent'>
      <CardHeader className='space-y-1 p-5 pb-3'>
        <CardTitle className='text-lg tracking-tight'>Sentry</CardTitle>
        <p className='text-2xs text-tertiary-token'>
          Production errors from the last 24 hours
        </p>
      </CardHeader>
      <CardContent className='space-y-4 p-5 pt-0'>
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
      </CardContent>
    </Card>
  );
}
