'use client';

import { ChartBarIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SkeletonCard } from '@/components/molecules/SkeletonCard';
import { EmptyState } from '@/components/organisms/EmptyState';
import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

type CityRange = Extract<AnalyticsRange, '7d' | '30d'>;

interface AnalyticsCardsProps {
  profileUrl?: string;
}

export function AnalyticsCards({ profileUrl }: AnalyticsCardsProps) {
  const [range, setRange] = useState<CityRange>('7d');

  // Animated display values for a subtle count-up effect
  const [displayValues, setDisplayValues] =
    useState<DashboardAnalyticsResponse>({
      profile_views: 0,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
    });
  const [copied, setCopied] = useState(false);

  const { data, error, loading, refresh } = useDashboardAnalytics({
    range,
    view: 'traffic',
  });

  // Run count-up animation when data changes
  useEffect(() => {
    const duration = 800; // ms
    const startValues = { ...displayValues };
    const endValues = {
      profile_views: data?.profile_views ?? 0,
      top_cities: data?.top_cities ?? [],
      top_countries: data?.top_countries ?? [],
      top_referrers: data?.top_referrers ?? [],
      view: data?.view,
    };
    const startTime = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next: DashboardAnalyticsResponse = {
        profile_views: Math.round(
          startValues.profile_views +
            (endValues.profile_views - startValues.profile_views) * eased
        ),
        top_cities: endValues.top_cities,
        top_countries: endValues.top_countries,
        top_referrers: endValues.top_referrers,
        view: endValues.view,
      };
      setDisplayValues(next);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const cityRows = useMemo(() => {
    const cities = displayValues.top_cities ?? [];
    return cities.slice(0, 5);
  }, [displayValues.top_cities]);

  const referrerRows = useMemo(() => {
    const referrers = displayValues.top_referrers ?? [];
    return referrers.slice(0, 5);
  }, [displayValues.top_referrers]);

  const formatReferrerLabel = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Direct';

    try {
      const url = new URL(trimmed);
      return url.host || trimmed;
    } catch {
      return trimmed;
    }
  };

  const profileViewsLabel = useMemo(() => {
    const value = displayValues.profile_views ?? 0;
    return Intl.NumberFormat().format(value);
  }, [displayValues.profile_views]);

  const topCitiesLabel = useMemo(() => {
    const value = cityRows.length;
    return Intl.NumberFormat().format(value);
  }, [cityRows.length]);

  const topCitiesContent = (
    <div className='grid grid-cols-1 gap-2'>
      {cityRows.length === 0 ? (
        <div className='rounded-xl border border-subtle bg-surface-2/20 px-3 py-3'>
          <p className='text-sm text-tertiary-token'>No city data yet.</p>
        </div>
      ) : (
        cityRows.map(row => (
          <div
            key={row.city}
            className='flex items-center justify-between rounded-xl border border-subtle bg-surface-2/25 px-3 py-2'
          >
            <p className='text-sm font-medium text-primary-token'>{row.city}</p>
            <p className='text-sm tabular-nums text-secondary-token'>
              {row.count}
            </p>
          </div>
        ))
      )}
    </div>
  );

  const rangeToggle = (
    <div
      role='group'
      aria-label='Traffic window'
      className='inline-flex rounded-full border border-subtle bg-surface-1/40 p-0.5 ring-1 ring-inset ring-white/5 dark:ring-white/10 backdrop-blur-sm'
    >
      {(
        [
          { id: '7d', label: '7d' },
          { id: '30d', label: '30d' },
        ] as const
      ).map(opt => {
        const active = range === opt.id;
        return (
          <button
            key={opt.id}
            type='button'
            onClick={() => setRange(opt.id)}
            aria-pressed={active}
            className={
              active
                ? 'h-6 rounded-full bg-surface-1 px-2.5 text-xs font-semibold text-primary-token shadow-sm shadow-black/10 dark:shadow-black/40'
                : 'h-6 rounded-full px-2.5 text-xs font-medium text-secondary-token transition-colors hover:bg-surface-2/40 hover:text-primary-token'
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center p-8 text-center space-y-4'>
        <div className='w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center'>
          <svg
            className='w-6 h-6 text-accent-token'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
            />
          </svg>
        </div>
        <div>
          <h3 className='text-sm font-medium text-primary-token mb-1'>
            Analytics temporarily unavailable
          </h3>
          <p className='text-xs text-secondary-token'>
            We couldn&apos;t fetch your analytics data right now
          </p>
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className='inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary-token bg-surface-2 hover:bg-surface-3 border border-subtle rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {loading ? (
            <>
              <div className='w-3 h-3 border border-current border-t-transparent rounded-full animate-spin'></div>
              Retrying...
            </>
          ) : (
            <>
              <svg
                className='w-3 h-3'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                />
              </svg>
              Try again
            </>
          )}
        </button>
      </div>
    );
  }

  const allZero =
    (data?.profile_views ?? 0) === 0 &&
    (data?.top_cities?.length ?? 0) === 0 &&
    (data?.top_referrers?.length ?? 0) === 0;

  const handleCopy = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  if (allZero) {
    return (
      <EmptyState
        type='analytics'
        title='No profile views yet'
        description='Share your profile link to start tracking clicks and engagement from your fans.'
        actionLabel={copied ? 'Copied!' : 'Copy Profile Link'}
        onAction={profileUrl ? handleCopy : undefined}
      />
    );
  }

  return (
    <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
      <AnalyticsCard
        title='Profile views'
        value={profileViewsLabel}
        metadata='All-time'
        icon={ChartBarIcon}
        iconClassName='text-sky-600 dark:text-sky-400'
        iconChipClassName='bg-sky-500/10 dark:bg-sky-500/15'
      />

      <AnalyticsCard
        title='Top cities'
        value={topCitiesLabel}
        metadata={`Traffic window: ${range === '7d' ? 'Last 7 days' : 'Last 30 days'}`}
        icon={MapPinIcon}
        iconClassName='text-violet-600 dark:text-violet-400'
        iconChipClassName='bg-violet-500/10 dark:bg-violet-500/15'
        headerRight={rangeToggle}
      >
        {topCitiesContent}
      </AnalyticsCard>

      <DashboardCard variant='analytics' className='sm:col-span-2'>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
            Traffic from
          </p>
          {rangeToggle}
        </div>

        <div className='mt-3 grid grid-cols-1 gap-2'>
          {referrerRows.length === 0 ? (
            <div className='rounded-xl border border-subtle bg-surface-2/20 px-3 py-3'>
              <p className='text-sm text-tertiary-token'>
                No traffic source data yet.
              </p>
            </div>
          ) : (
            referrerRows.map(row => (
              <div
                key={row.referrer}
                className='flex items-center justify-between rounded-xl border border-subtle bg-surface-2/25 px-3 py-2'
              >
                <p className='text-sm font-medium text-primary-token'>
                  {formatReferrerLabel(row.referrer)}
                </p>
                <p className='text-sm tabular-nums text-secondary-token'>
                  {row.count}
                </p>
              </div>
            ))
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
