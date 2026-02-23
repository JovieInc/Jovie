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
      <div className='rounded-xl border border-border/60 bg-card/50 p-5'>
        <h3 className='text-sm font-medium text-primary-token'>Sentry</h3>
        <p className='mt-2 text-sm text-secondary-token'>
          {metrics.errorMessage ??
            'Sentry metrics are temporarily unavailable. Please try again shortly.'}
        </p>
      </div>
    );
  }

  const topIssueLabel =
    metrics.topIssueTitle && metrics.topIssueShortId
      ? `${metrics.topIssueShortId}: ${metrics.topIssueTitle}`
      : 'No unresolved issues in the last 24 hours.';

  return (
    <div className='rounded-xl border border-border/60 bg-card/50 p-5'>
      <div className='mb-4'>
        <h3 className='text-sm font-medium text-primary-token'>Sentry</h3>
        <p className='text-xs text-tertiary-token'>
          Production errors from the last 24 hours
        </p>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <div className='rounded-lg bg-background/60 p-3'>
          <p className='flex items-center gap-2 text-xs text-secondary-token'>
            <Bug className='size-4 text-blue-500' />
            Unresolved issues
          </p>
          <p className='mt-2 text-xl font-semibold text-primary-token tabular-nums'>
            {formatMetric(metrics.unresolvedIssues24h)}
          </p>
        </div>

        <div className='rounded-lg bg-background/60 p-3'>
          <p className='flex items-center gap-2 text-xs text-secondary-token'>
            <Flame className='size-4 text-amber-500' />
            Error events
          </p>
          <p className='mt-2 text-xl font-semibold text-primary-token tabular-nums'>
            {formatMetric(metrics.totalEvents24h)}
          </p>
        </div>

        <div className='rounded-lg bg-background/60 p-3'>
          <p className='flex items-center gap-2 text-xs text-secondary-token'>
            <Users className='size-4 text-violet-500' />
            Impacted users
          </p>
          <p className='mt-2 text-xl font-semibold text-primary-token tabular-nums'>
            {formatMetric(metrics.impactedUsers24h)}
          </p>
        </div>

        <div className='rounded-lg bg-background/60 p-3'>
          <p className='flex items-center gap-2 text-xs text-secondary-token'>
            <AlertOctagon className='size-4 text-red-500' />
            Critical issues
          </p>
          <p className='mt-2 text-xl font-semibold text-primary-token tabular-nums'>
            {formatMetric(metrics.criticalIssues24h)}
          </p>
        </div>
      </div>

      <p className='mt-4 text-xs text-tertiary-token'>{topIssueLabel}</p>
    </div>
  );
}
