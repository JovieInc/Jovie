import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import { AlertOctagon, Bug, Flame, Users } from 'lucide-react';
import type { AdminSentryMetrics } from '@/lib/admin/sentry-metrics';

interface SentryMetricsCardProps {
  readonly metrics: AdminSentryMetrics;
}

function formatMetric(value: number): string {
  return value.toLocaleString('en-US');
}

export function SentryMetricsCard({
  metrics,
}: Readonly<SentryMetricsCardProps>) {
  if (!metrics.isConfigured || !metrics.isAvailable) {
    return (
      <Card className='border-subtle bg-surface-1/80'>
        <CardHeader className='p-5 pb-2'>
          <CardTitle className='text-lg tracking-tight'>Sentry</CardTitle>
        </CardHeader>
        <CardContent className='p-5 pt-0'>
          <p className='text-app text-secondary-token'>
            {metrics.errorMessage ??
              'Sentry metrics are temporarily unavailable. Please try again shortly.'}
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
    <Card className='border-subtle bg-surface-1/80'>
      <CardHeader className='space-y-1 p-5 pb-3'>
        <CardTitle className='text-lg tracking-tight'>Sentry</CardTitle>
        <p className='text-2xs text-tertiary-token'>
          Production errors from the last 24 hours
        </p>
      </CardHeader>
      <CardContent className='space-y-4 p-5 pt-0'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <div className='rounded-lg bg-surface-2 p-3'>
            <p className='flex items-center gap-2 text-2xs text-secondary-token'>
              <Bug className='size-4 text-info' />
              Unresolved issues
            </p>
            <p className='mt-2 text-2xl font-semibold text-primary-token tabular-nums'>
              {formatMetric(metrics.unresolvedIssues24h)}
            </p>
          </div>

          <div className='rounded-lg bg-surface-2 p-3'>
            <p className='flex items-center gap-2 text-2xs text-secondary-token'>
              <Flame className='size-4 text-warning' />
              Error events
            </p>
            <p className='mt-2 text-2xl font-semibold text-primary-token tabular-nums'>
              {formatMetric(metrics.totalEvents24h)}
            </p>
          </div>

          <div className='rounded-lg bg-surface-2 p-3'>
            <p className='flex items-center gap-2 text-2xs text-secondary-token'>
              <Users className='size-4 text-[var(--color-chart-4)]' />
              Impacted users
            </p>
            <p className='mt-2 text-2xl font-semibold text-primary-token tabular-nums'>
              {formatMetric(metrics.impactedUsers24h)}
            </p>
          </div>

          <div className='rounded-lg bg-surface-2 p-3'>
            <p className='flex items-center gap-2 text-2xs text-secondary-token'>
              <AlertOctagon className='size-4 text-error' />
              Critical issues
            </p>
            <p className='mt-2 text-2xl font-semibold text-primary-token tabular-nums'>
              {formatMetric(metrics.criticalIssues24h)}
            </p>
          </div>
        </div>

        <p className='text-2xs text-tertiary-token'>{topIssueLabel}</p>
      </CardContent>
    </Card>
  );
}
