import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { PmfMetrics } from '@/lib/admin/pmf-metrics-model';

function pct(value: number | null): string {
  return value === null ? 'No base' : `${(value * 100).toFixed(1)}%`;
}

function MetricRow({
  label,
  value,
  detail,
}: Readonly<{ label: string; value: string; detail: string }>) {
  return (
    <li className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5'>
      <span className='w-48 shrink-0 text-primary-token'>{label}</span>
      <span className='w-16 shrink-0 tabular-nums'>{value}</span>
      <span className='min-w-0 flex-1 text-secondary-token'>{detail}</span>
    </li>
  );
}

/** Read-only PMF metric: activation of admitted users and the survey. */
export function PmfMetricsPanel({
  metrics,
}: Readonly<{ metrics: PmfMetrics | null }>) {
  return (
    <ContentSurfaceCard surface='details'>
      <div className='space-y-3 p-3' data-testid='pmf-metrics-panel'>
        <div>
          <h2 className='text-balance text-app font-semibold text-primary-token'>
            Product Market Fit
          </h2>
          <p className='mt-1 text-app text-secondary-token'>
            Admitted users who activated, and the share of survey answers that
            would be very disappointed without Jovie. Internal accounts are
            excluded.
          </p>
        </div>
        {metrics ? (
          <ul className='divide-y divide-subtle text-app'>
            <MetricRow
              label='Activation Rate'
              value={pct(metrics.activationRate)}
              detail={`${metrics.activatedUsers} of ${metrics.admittedUsers} admitted users finished onboarding`}
            />
            <MetricRow
              label='Very Disappointed'
              value={pct(metrics.veryDisappointedRate)}
              detail={
                metrics.surveyResponses === 0
                  ? `No answers yet. Target ${pct(metrics.target)}.`
                  : `${metrics.veryDisappointed} of ${metrics.surveyResponses} answers. Target ${pct(metrics.target)}, ${metrics.meetsTarget ? 'met' : 'not met yet'}.`
              }
            />
          </ul>
        ) : (
          <p className='text-app text-secondary-token'>
            The PMF metric could not be read. Check the PMF metrics query.
          </p>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
