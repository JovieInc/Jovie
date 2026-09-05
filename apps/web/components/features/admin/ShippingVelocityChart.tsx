'use client';

import { Button } from '@jovie/ui';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import type { HudObservationState } from '@/lib/hud/observation';
import { observationFromShippingVelocityBuckets } from '@/lib/hud/shipping-velocity-observation';

export type { DailyBucket };

type Range = '7d' | '30d' | '1y';

export interface ShippingVelocityChartProps {
  readonly initialData?: DailyBucket[];
  readonly initialRange?: Range;
  readonly cachedAt?: string;
}

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '1y', label: '1Y' },
];

const SERIES_COLORS = {
  merged: 'var(--color-accent-blue)',
  opened: 'var(--color-accent-purple)',
  closed: 'var(--color-accent-gray)',
} as const;

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const AGE_TICK_INTERVAL_MS = 30 * 1000;

function cachedAtTimestamp(cachedAt: string | undefined): number | null {
  if (!cachedAt) return null;
  const timestamp = new Date(cachedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatCachedAgo(cachedTimestamp: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - cachedTimestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hr ago';
  return `${hours} hrs ago`;
}

function ChartSkeleton() {
  return (
    <div
      className='h-50 w-full rounded-lg bg-surface-0'
      role='status'
      aria-label='Loading Shipping Chart'
    />
  );
}

const LazyVelocityChart = dynamic(
  () =>
    import('./ShippingVelocityCanvas').then(
      module => module.ShippingVelocityCanvas
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export function ShippingVelocityChart({
  initialData,
  initialRange = '7d',
  cachedAt: initialCachedAt,
}: Readonly<ShippingVelocityChartProps>) {
  const [requestedRange, setRequestedRange] = useState<Range>(initialRange);
  const [displayedRange, setDisplayedRange] = useState<Range | null>(
    initialData ? initialRange : null
  );
  const [data, setData] = useState<DailyBucket[]>(initialData ?? []);
  const [cachedAt, setCachedAt] = useState<string | undefined>(initialCachedAt);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState<HudObservationState>(
    initialData
      ? observationFromShippingVelocityBuckets(initialData)
      : 'loading'
  );
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const titleId = useId();
  const summaryId = useId();
  const hasObservedRef = useRef(Boolean(initialData));
  const shouldSkipInitialFetchRef = useRef(Boolean(initialData));
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef<{
    readonly controller: AbortController;
    readonly requestId: number;
  } | null>(null);
  const initialCachedTimestamp = cachedAtTimestamp(initialCachedAt);
  const lastRequestStartedAtRef = useRef<number | null>(
    initialData
      ? Math.min(Date.now(), initialCachedTimestamp ?? Date.now())
      : null
  );

  const fetchData = useCallback(async (rangeToFetch: Range) => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    activeRequestRef.current = { controller, requestId };
    lastRequestStartedAtRef.current = Date.now();

    if (!hasObservedRef.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const isActiveRequest = () =>
      activeRequestRef.current?.requestId === requestId &&
      !controller.signal.aborted;

    try {
      const response = await fetch(
        `/api/admin/hud/shipping-velocity?range=${rangeToFetch}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch (${response.status})`);
      }
      const result = (await response.json()) as ShippingVelocityResponse;
      if (!isActiveRequest()) return;
      if (result.range !== rangeToFetch) {
        throw new Error(
          `Received ${result.range} data while loading ${rangeToFetch}`
        );
      }
      setData(result.data);
      setCachedAt(result.cachedAt);
      setDisplayedRange(result.range);
      setError(result.errorMessage ?? null);
      setObservation(
        result.observation ??
          observationFromShippingVelocityBuckets(result.data)
      );
      hasObservedRef.current = true;
    } catch (err) {
      if (!isActiveRequest()) return;
      setError(
        err instanceof Error ? err.message : 'Could not load shipping data'
      );
      setObservation('unavailable');
    } finally {
      if (activeRequestRef.current?.requestId === requestId) {
        activeRequestRef.current = null;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Fetch when range changes (but not on initial mount if initialData is provided)
  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }
    fetchData(requestedRange).catch(() => {});
  }, [requestedRange, fetchData]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let ageTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const clearTimers = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (ageTimer) clearInterval(ageTimer);
      refreshTimer = null;
      ageTimer = null;
    };

    const scheduleRefresh = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      const now = Date.now();
      const lastStartedAt = lastRequestStartedAtRef.current;
      const elapsed =
        lastStartedAt === null ? REFRESH_INTERVAL_MS : now - lastStartedAt;
      const delay = Math.max(0, REFRESH_INTERVAL_MS - elapsed);

      refreshTimer = setTimeout(() => {
        if (disposed || document.visibilityState !== 'visible') return;
        fetchData(requestedRange).catch(() => {});
        scheduleRefresh();
      }, delay);
    };

    const activate = () => {
      clearTimers();
      if (disposed) return;
      if (document.visibilityState !== 'visible') {
        activeRequestRef.current?.controller.abort();
        return;
      }

      const now = Date.now();
      setNowMs(now);
      ageTimer = setInterval(() => setNowMs(Date.now()), AGE_TICK_INTERVAL_MS);

      const lastStartedAt = lastRequestStartedAtRef.current;
      const activeRequest = activeRequestRef.current;
      const needsInitialObservation =
        !hasObservedRef.current &&
        (activeRequest === null || activeRequest.controller.signal.aborted);
      if (
        needsInitialObservation ||
        (lastStartedAt !== null && now - lastStartedAt >= REFRESH_INTERVAL_MS)
      ) {
        fetchData(requestedRange).catch(() => {});
      }
      scheduleRefresh();
    };

    document.addEventListener('visibilitychange', activate);
    activate();

    return () => {
      disposed = true;
      clearTimers();
      document.removeEventListener('visibilitychange', activate);
    };
  }, [fetchData, requestedRange]);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    },
    []
  );

  function handleRangeChange(newRange: Range) {
    setRequestedRange(newRange);
    setSpotlight(null);
  }

  const handleLineClick = useCallback((series: string) => {
    setSpotlight(prev => (prev === series ? null : series));
  }, []);

  const handleChartClick = useCallback(() => {
    setSpotlight(null);
  }, []);

  const handleRetry = () => {
    fetchData(requestedRange).catch(() => {});
  };
  const cachedTimestamp = cachedAtTimestamp(cachedAt);
  const isStale =
    cachedTimestamp !== null && nowMs - cachedTimestamp >= REFRESH_INTERVAL_MS;
  const freshnessLabel =
    cachedTimestamp === null ? null : formatCachedAgo(cachedTimestamp, nowMs);
  const retainedRangeMessage = displayedRange
    ? requestedRange === displayedRange
      ? `Showing last known ${displayedRange.toUpperCase()} velocity. ${error ?? 'Refresh failed.'}`
      : `Showing last known ${displayedRange.toUpperCase()} velocity. ${requestedRange.toUpperCase()} refresh failed. ${error ?? ''}`.trim()
    : (error ?? 'Shipping velocity is unavailable.');
  const showChart =
    observation !== 'not_configured' &&
    observation !== 'loading' &&
    !(observation === 'unavailable' && data.length === 0) &&
    observation !== 'empty';
  const totals = data.reduce(
    (sum, bucket) => ({
      merged: sum.merged + bucket.merged,
      opened: sum.opened + bucket.opened,
      closed: sum.closed + bucket.closed,
    }),
    { merged: 0, opened: 0, closed: 0 }
  );
  const accessibleSummary = `${displayedRange?.toUpperCase() ?? requestedRange.toUpperCase()} shipping velocity: ${totals.merged} merged, ${totals.opened} opened, and ${totals.closed} closed without merge.`;

  return (
    <div className='p-4'>
      {/* Header row */}
      <div className='mb-3 flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <h3
            id={titleId}
            className='text-2xs font-semibold tracking-normal text-secondary-token'
          >
            Shipping Velocity
          </h3>
          {/* Legend */}
          <div className='flex items-center gap-2.5'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => handleLineClick('merged')}
              className='h-auto flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100 hover:bg-transparent'
              aria-label='Toggle Merged Series Spotlight'
              aria-pressed={spotlight === 'merged'}
            >
              <span
                className='block h-1 w-3 rounded-full'
                style={{ backgroundColor: SERIES_COLORS.merged }}
              />
              <span className='text-3xs text-tertiary-token'>Merged</span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={() => handleLineClick('opened')}
              className='h-auto flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100 hover:bg-transparent'
              aria-label='Toggle Opened Series Spotlight'
              aria-pressed={spotlight === 'opened'}
            >
              <span
                className='block h-1 w-3 rounded-full'
                style={{ backgroundColor: SERIES_COLORS.opened }}
              />
              <span className='text-3xs text-tertiary-token'>Opened</span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={() => setShowClosed(prev => !prev)}
              className='h-auto flex items-center gap-1 transition-opacity hover:opacity-100 hover:bg-transparent'
              style={{ opacity: showClosed ? 0.8 : 0.4 }}
              aria-label='Toggle Closed Series Visibility'
              aria-pressed={showClosed}
            >
              <span
                className='block h-1 w-3 rounded-full'
                style={{ backgroundColor: SERIES_COLORS.closed }}
              />
              <span className='text-3xs text-tertiary-token'>Closed</span>
            </Button>
          </div>
        </div>

        {/* Range toggle */}
        <div className='flex items-center gap-0.5 rounded-lg border border-subtle bg-surface-0 p-0.5'>
          {RANGE_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => handleRangeChange(opt.value)}
              className={
                requestedRange === opt.value
                  ? 'h-auto rounded-md bg-surface-2 px-2.5 py-1 text-2xs font-semibold text-primary-token'
                  : 'h-auto rounded-md px-2.5 py-1 text-2xs font-medium text-tertiary-token transition-colors hover:text-secondary-token'
              }
              aria-pressed={requestedRange === opt.value}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stable observation viewport across asynchronous states. */}
      <div className='min-h-72'>
        {isLoading && data.length === 0 ? (
          <ChartSkeleton />
        ) : observation === 'not_configured' ? (
          <div className='flex h-50 items-center'>
            <HudObservationStatus
              state='not_configured'
              message={
                error ?? 'GitHub is not configured for shipping velocity.'
              }
              testId='hud-shipping-velocity-observation'
            />
          </div>
        ) : observation === 'empty' ? (
          <div className='flex h-50 items-center'>
            <HudObservationStatus
              state='empty'
              message='No Pull Requests in this period. Zero is shown only after a successful observation.'
              freshnessLabel={freshnessLabel}
              testId='hud-shipping-velocity-observation'
            />
          </div>
        ) : observation === 'unavailable' && data.length === 0 ? (
          <div className='flex h-50 items-center'>
            <HudObservationStatus
              state='unavailable'
              message={error ?? 'Shipping velocity is unavailable.'}
              freshnessLabel={freshnessLabel}
              onRetry={handleRetry}
              testId='hud-shipping-velocity-observation'
            />
          </div>
        ) : showChart ? (
          <>
            <div
              className='min-h-14'
              data-testid='shipping-velocity-status-slot'
            >
              {observation === 'unavailable' || observation === 'stale' ? (
                <HudObservationStatus
                  state={observation}
                  message={
                    observation === 'stale'
                      ? (error ??
                        'Refresh unavailable; showing last verified shipping velocity.')
                      : retainedRangeMessage
                  }
                  freshnessLabel={freshnessLabel}
                  onRetry={handleRetry}
                  testId='hud-shipping-velocity-observation'
                />
              ) : null}
            </div>
            <figure
              aria-labelledby={titleId}
              aria-describedby={summaryId}
              data-testid='shipping-velocity-figure'
            >
              <LazyVelocityChart
                data={data}
                spotlight={spotlight}
                onLineClick={handleLineClick}
                onChartClick={handleChartClick}
                showClosed={showClosed}
              />
              <figcaption id={summaryId} className='sr-only'>
                {accessibleSummary}
              </figcaption>
            </figure>
          </>
        ) : (
          <ChartSkeleton />
        )}
      </div>
      <p className='mt-2 text-xs text-secondary-token'>
        GitHub pull requests · UTC days · Counts per day. Merges are source
        changes; deployment and verified runtime require separate receipts.
      </p>
      {/* Footer */}
      <div
        className='mt-2 min-h-4 truncate text-right text-3xs text-tertiary-token'
        data-testid='shipping-velocity-freshness'
      >
        {displayedRange && freshnessLabel && !isLoading
          ? `${isRefreshing ? 'Refreshing' : 'Showing'} ${displayedRange.toUpperCase()} · Updated ${freshnessLabel}${isStale ? ' · Stale' : ''}`
          : null}
      </div>
    </div>
  );
}
