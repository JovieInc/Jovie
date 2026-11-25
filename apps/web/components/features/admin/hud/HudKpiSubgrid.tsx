'use client';

import { Button } from '@jovie/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricDelta } from '@/components/molecules/ContentMetricDelta';
import { Sparkline } from '@/components/shell/Sparkline';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import type { MetricPolarity } from '@/lib/design/metric-tone';
import { medianNumber } from '@/lib/hud/number-series';
import { isSuccessfulHudObservation } from '@/lib/hud/observation';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { FetchHttpError } from '@/lib/queries/fetch';
import { formatTimestampUTC } from '@/lib/utils/date-formatting';
import type { HudMetrics } from '@/types/hud';

const KPI_VALUE_CLASS =
  'text-2xl font-[620] leading-none tracking-[-0.03em] tabular-nums sm:text-3xl';

function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

function deltaPercent(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) {
    return null;
  }
  return ((current - prior) / prior) * 100;
}

function sumMerged(buckets: readonly DailyBucket[]): number {
  return buckets.reduce((total, bucket) => total + bucket.merged, 0);
}

function dailyMergeHours({ mergeP50Hours }: DailyBucket): number | null {
  return typeof mergeP50Hours === 'number' && Number.isFinite(mergeP50Hours)
    ? mergeP50Hours
    : null;
}

function medianDailyMergeHours(buckets: readonly DailyBucket[]): number | null {
  return medianNumber(
    buckets.map(dailyMergeHours).filter(value => value !== null)
  );
}

async function fetchShippingVelocity(
  signal: AbortSignal
): Promise<ShippingVelocityResponse> {
  const response = await fetch('/api/admin/hud/shipping-velocity?range=30d', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new FetchHttpError(
      `Request failed (${response.status})`,
      response.status,
      response
    );
  }
  return (await response.json()) as ShippingVelocityResponse;
}

function DailyTrend({
  points,
  label,
}: Readonly<{ points: readonly (number | null)[]; label: string }>) {
  return (
    <div className='mt-1.5 h-7'>
      {points.length > 0 && (
        <Sparkline
          points={points}
          variant='pulse'
          trend='flat'
          polarity='neutral'
          ariaLabel={label}
          className='block h-full w-full'
        />
      )}
    </div>
  );
}

function DeltaLine({
  deltaPct,
  polarity,
}: Readonly<{
  readonly deltaPct: number | null;
  readonly polarity: MetricPolarity;
}>) {
  if (deltaPct === null) {
    return (
      <span className='text-2xs text-tertiary-token'>{'—'} vs prior 7d</span>
    );
  }
  const direction =
    Math.abs(deltaPct) < 0.05 ? 'flat' : deltaPct > 0 ? 'up' : 'down';
  const value = `${Math.abs(deltaPct).toFixed(1)}% vs prior 7d`;
  return (
    <ContentMetricDelta
      direction={direction}
      polarity={polarity}
      value={value}
      aria-label={`${direction === 'flat' ? 'Flat' : direction === 'up' ? 'Up' : 'Down'} ${value}`}
      className='text-2xs'
      iconClassName='size-3'
    />
  );
}

function MetricSubtitle({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return <div className='grid gap-1'>{children}</div>;
}

function KpiMetricCard({
  label,
  value,
  subtitle,
  testId,
}: Readonly<{
  readonly label: string;
  readonly value: string;
  readonly subtitle: ReactNode;
  readonly testId: string;
}>) {
  return (
    <ContentMetricCard
      label={label}
      value={value}
      subtitle={subtitle}
      valueClassName={KPI_VALUE_CLASS}
      data-testid={testId}
    />
  );
}

/**
 * Velocity/agent noise tiles for the operator HUD: ship velocity,
 * PR merge time, and active agents. Cash lives once in the need band.
 */
export function HudKpiSubgrid({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  const velocityQuery = useQuery({
    queryKey: ['hud', 'kpi', 'shipping-velocity', '30d'],
    queryFn: ({ signal }) => fetchShippingVelocity(signal),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const observation = velocityQuery.data?.observation;
  const status =
    velocityQuery.error instanceof FetchHttpError
      ? velocityQuery.error.status
      : null;
  const needsSignIn = status === 401;
  const denied = needsSignIn || status === 403;
  const accessMessage = needsSignIn
    ? 'Sign in to view shipping data.'
    : 'Only Ovie operators can view shipping data.';
  const hasVelocityData =
    !denied &&
    observation !== undefined &&
    isSuccessfulHudObservation(observation);
  const buckets = hasVelocityData ? (velocityQuery.data?.data ?? []) : [];
  const last7 = buckets.slice(-7);
  const prior7 = buckets.slice(-14, -7);
  const mergedLast7 = sumMerged(last7);
  const velocityDelta =
    prior7.length === 7 ? deltaPercent(mergedLast7, sumMerged(prior7)) : null;

  const mergeTimeLast7 = medianDailyMergeHours(last7);
  const mergeTimePrior7 = medianDailyMergeHours(prior7);
  const mergeTimeDelta =
    prior7.length === 7 && mergeTimeLast7 !== null && mergeTimePrior7 !== null
      ? deltaPercent(mergeTimeLast7, mergeTimePrior7)
      : null;
  const cards: Array<{
    label: string;
    value: string;
    subtitle: ReactNode;
    testId: string;
  }> = [
    {
      label: 'Ship Velocity',
      value: hasVelocityData ? mergedLast7.toLocaleString('en-US') : '—',
      subtitle: (
        <MetricSubtitle>
          <span>PRs merged, last 7d</span>
          <DeltaLine deltaPct={velocityDelta} polarity='higher-is-better' />
          <DailyTrend
            points={buckets.map(bucket => bucket.merged)}
            label='Daily Merged Pull Requests'
          />
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-ship-velocity',
    },
    {
      label: 'PR Merge Time',
      value: hasVelocityData ? formatHours(mergeTimeLast7) : '—',
      subtitle: (
        <MetricSubtitle>
          <span>Median of daily P50s, last 7d</span>
          <DeltaLine deltaPct={mergeTimeDelta} polarity='lower-is-better' />
          <DailyTrend
            points={buckets.map(dailyMergeHours)}
            label='Daily Median Hours To Merge'
          />
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-merge-time',
    },
    {
      label: 'Active Agents',
      value: metrics.aiOps.counts.running.toLocaleString('en-US'),
      subtitle: (
        <MetricSubtitle>
          <span className='tabular-nums'>
            Queued {metrics.aiOps.counts.queued.toLocaleString('en-US')} |
            Review {metrics.aiOps.counts.review.toLocaleString('en-US')}
          </span>
          <span className='tabular-nums'>
            {metrics.aiOps.mergeQueue.openAgentPrs} /{' '}
            {metrics.aiOps.mergeQueue.openAgentPrThreshold} agent PRs open
          </span>
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-active-agents',
    },
  ];

  return (
    <div className='space-y-2' data-testid='hud-kpi-subgrid'>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        {cards.map(card => (
          <KpiMetricCard key={card.testId} {...card} />
        ))}
      </div>
      <details className='text-xs text-secondary-token'>
        <summary className='w-fit cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'>
          Daily Shipping Data
          {hasVelocityData &&
          (observation === 'stale' || velocityQuery.isRefetchError)
            ? ' · Cached'
            : ''}
        </summary>
        {buckets.length > 0 ? (
          <div className='mt-2'>
            <p>
              GitHub · UTC days · As of{' '}
              {formatTimestampUTC(velocityQuery.data?.cachedAt)}
            </p>
            <ol
              aria-label='Daily Shipping Observations'
              className='mt-1 space-y-1 tabular-nums'
            >
              {buckets.map(bucket => {
                const hours = dailyMergeHours(bucket);
                return (
                  <li
                    key={bucket.date}
                    className='flex flex-wrap items-baseline gap-x-3'
                  >
                    <time dateTime={bucket.date}>{bucket.date}</time>
                    <span>Merged PRs: {bucket.merged}</span>
                    <span>
                      Median merge time:{' '}
                      {hours === null ? 'Not measured' : `${hours} h`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : denied ? (
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <p role='status'>{accessMessage}</p>
            <Button asChild size='sm' variant='ghost'>
              <Link
                href={
                  needsSignIn
                    ? buildAppShellSignInUrl(APP_ROUTES.ADMIN_OPS)
                    : APP_ROUTES.DASHBOARD
                }
              >
                {needsSignIn ? 'Sign In' : 'Open Dashboard'}
              </Link>
            </Button>
          </div>
        ) : hasVelocityData ? (
          <p className='mt-2' role='status'>
            GitHub reported no daily observations.
          </p>
        ) : (
          <div className='mt-2 flex items-center gap-2'>
            <p role='status'>
              {velocityQuery.isFetching
                ? 'Loading shipping data.'
                : 'GitHub shipping data is unavailable. Retry to load the daily observations.'}
            </p>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={velocityQuery.isFetching}
              onClick={() => {
                void velocityQuery.refetch({ cancelRefetch: false });
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </details>
    </div>
  );
}
