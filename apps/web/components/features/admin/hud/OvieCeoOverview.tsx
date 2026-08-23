'use client';

import { ExternalLink } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  COMPANY_METRIC_STATES,
  type CompanyMetricState,
  deriveOvieCompanyOverview,
} from '@/lib/ovie/company-operations';
import type { HudMetrics } from '@/types/hud';

const STATE_LABELS = {
  fresh: 'Fresh',
  stale: 'Stale',
  disconnected: 'Disconnected',
  unavailable: 'Unavailable',
  unauthorized: 'Unauthorized',
  degraded: 'Degraded',
  unknown: 'Unknown',
  'measured-zero': 'Measured Zero',
} as const satisfies Record<CompanyMetricState, string>;

const STATE_TONES = {
  fresh: 'text-tertiary-token',
  stale: 'text-warning',
  disconnected: 'text-warning',
  unavailable: 'text-error',
  unauthorized: 'text-error',
  degraded: 'text-warning',
  unknown: 'text-secondary-token',
  'measured-zero': 'text-tertiary-token',
} as const satisfies Record<CompanyMetricState, string>;

function formatObservationTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function OvieCeoOverview({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  const overview = deriveOvieCompanyOverview(metrics);

  return (
    <ContentSurfaceCard
      surface='default'
      className='overflow-hidden p-0'
      data-testid='ovie-ceo-overview'
    >
      <div className='border-b border-subtle px-4 py-3 sm:px-5'>
        <p className='text-xs font-semibold text-primary-token'>Company Now</p>
        <p className='mt-1 text-app text-secondary-token'>
          Three answers by default. Source detail and operating tools stay
          below.
        </p>
      </div>
      <div className='divide-y divide-subtle'>
        {overview.metrics.map(metric => (
          <section
            key={metric.id}
            className='grid min-h-32 gap-3 px-4 py-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(12rem,1fr)_minmax(16rem,1.5fr)] sm:items-start sm:px-5'
            data-testid={`ovie-core-metric-${metric.id}`}
            data-state={metric.state}
          >
            <div className='space-y-1'>
              <p className='text-xs font-semibold text-secondary-token'>
                {metric.label}
              </p>
              <p className='text-3xl font-[620] leading-none tracking-[-0.04em] text-primary-token'>
                {metric.value}
              </p>
              <p
                className={`text-2xs font-medium ${STATE_TONES[metric.state]}`}
              >
                {STATE_LABELS[metric.state]}
              </p>
            </div>
            <p className='text-app leading-5 text-secondary-token'>
              {metric.detail}
            </p>
            <dl className='grid gap-1 text-2xs leading-4 text-tertiary-token'>
              <div>
                <dt className='inline font-medium text-secondary-token'>
                  Source{' '}
                </dt>
                <dd className='inline'>{metric.authoritativeSource}</dd>
              </div>
              <div>
                <dt className='inline font-medium text-secondary-token'>
                  Observed{' '}
                </dt>
                <dd className='inline'>
                  {formatObservationTime(metric.observedAt)}
                </dd>
              </div>
              <div>
                <dt className='inline font-medium text-secondary-token'>
                  Fresh Until{' '}
                </dt>
                <dd className='inline'>
                  {formatObservationTime(metric.freshnessDeadline)}
                </dd>
              </div>
              <div>
                <dt className='inline font-medium text-secondary-token'>
                  Owner{' '}
                </dt>
                <dd className='inline'>{metric.owner}</dd>
              </div>
              <div className='pt-1'>
                <a
                  href={metric.drillDownHref}
                  className='inline-flex items-center gap-1 font-medium text-secondary-token transition-colors hover:text-primary-token'
                  target={
                    metric.drillDownHref.startsWith('http')
                      ? '_blank'
                      : undefined
                  }
                  rel={
                    metric.drillDownHref.startsWith('http')
                      ? 'noopener noreferrer'
                      : undefined
                  }
                >
                  {metric.drillDownLabel}
                  <ExternalLink className='h-3 w-3' aria-hidden='true' />
                </a>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <span className='sr-only'>
        Supported states: {COMPANY_METRIC_STATES.join(', ')}
      </span>
    </ContentSurfaceCard>
  );
}
