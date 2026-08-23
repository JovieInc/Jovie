'use client';

import { ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
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
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export function OvieCeoOverview({
  metrics,
  onRetry,
  primaryValueClassName = 'text-3xl font-[620] leading-none tracking-[-0.04em]',
  secondaryValueClassName = 'text-3xl font-[620] leading-none tracking-[-0.04em]',
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly onRetry?: () => void;
  readonly primaryValueClassName?: string;
  readonly secondaryValueClassName?: string;
}>) {
  const [now, setNow] = useState(() => Date.parse(metrics.generatedAtIso));

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = globalThis.setInterval(updateNow, 30_000);
    return () => globalThis.clearInterval(interval);
  }, [metrics.generatedAtIso]);

  const generatedAt = Date.parse(metrics.generatedAtIso);
  const evaluationNow = Number.isFinite(generatedAt)
    ? Math.max(now, generatedAt)
    : now;
  const overview = deriveOvieCompanyOverview(metrics, evaluationNow);

  return (
    <ContentSurfaceCard
      surface='default'
      className='overflow-hidden p-0'
      data-testid='ovie-ceo-overview'
    >
      <div className='border-b border-subtle px-4 py-3 sm:px-5'>
        <p className='text-xs font-semibold text-primary-token'>Company Now</p>
      </div>
      <div className='divide-y divide-subtle'>
        {overview.metrics.map(metric => (
          <section
            key={metric.id}
            className='grid h-72 overflow-hidden gap-3 px-4 py-4 sm:px-5 lg:h-40 lg:grid-cols-[minmax(9rem,0.7fr)_minmax(12rem,1fr)_minmax(16rem,1.5fr)] lg:items-start'
            data-testid={`ovie-core-metric-${metric.id}`}
            data-state={metric.state}
          >
            <div className='space-y-1'>
              <p className='text-xs font-semibold text-secondary-token'>
                {metric.label}
              </p>
              <p
                className={`${
                  metric.id === 'company-survival'
                    ? primaryValueClassName
                    : secondaryValueClassName
                } text-primary-token`}
              >
                {metric.value}
              </p>
              <p
                className={`text-2xs font-medium ${STATE_TONES[metric.state]}`}
              >
                {STATE_LABELS[metric.state]}
              </p>
            </div>
            <p
              className='h-10 line-clamp-2 text-app leading-5 text-secondary-token lg:h-20 lg:line-clamp-4'
              title={metric.detail}
            >
              {metric.detail}
            </p>
            <dl className='grid grid-cols-2 gap-1 text-2xs leading-4 text-tertiary-token'>
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
              <div className='col-span-2 flex min-h-11 items-center gap-3 pt-1'>
                {onRetry &&
                [
                  'stale',
                  'unavailable',
                  'unauthorized',
                  'degraded',
                  'unknown',
                ].includes(metric.state) ? (
                  <button
                    type='button'
                    onClick={onRetry}
                    className='inline-flex min-h-11 shrink-0 items-center gap-1 font-medium text-secondary-token transition-colors hover:text-primary-token'
                  >
                    <RefreshCw className='h-3 w-3' aria-hidden='true' />
                    Retry
                  </button>
                ) : null}
                <a
                  href={metric.drillDownHref}
                  className='inline-flex min-h-11 min-w-0 items-center gap-1 font-medium text-secondary-token transition-colors hover:text-primary-token'
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
                  <span className='truncate'>{metric.drillDownLabel}</span>
                  {metric.drillDownHref.startsWith('http') ? (
                    <ExternalLink
                      className='h-3 w-3 shrink-0'
                      aria-hidden='true'
                    />
                  ) : (
                    <ChevronRight
                      className='h-3 w-3 shrink-0'
                      aria-hidden='true'
                    />
                  )}
                </a>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </ContentSurfaceCard>
  );
}
