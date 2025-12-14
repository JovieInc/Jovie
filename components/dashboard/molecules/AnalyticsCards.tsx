'use client';

import { ChartBarIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SkeletonCard } from '@/components/molecules/SkeletonCard';
import { EmptyState } from '@/components/organisms/EmptyState';
import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';
import type { AnalyticsRange } from '@/types/analytics';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

type CityRange = Extract<AnalyticsRange, '7d' | '30d'>;

interface AnalyticsCardsProps {
  profileUrl?: string;
  range?: CityRange;
  refreshSignal?: number;
}

export function AnalyticsCards({
  profileUrl,
  range = '7d',
  refreshSignal,
}: AnalyticsCardsProps) {
  const lastRefreshSignalRef = useRef<number>(
    typeof refreshSignal === 'number' ? refreshSignal : 0
  );

  // Animated display values for a subtle count-up effect
  const [displayProfileViews, setDisplayProfileViews] = useState(0);
  const [copied, setCopied] = useState(false);

  const { data, error, loading, refreshing, refresh } = useDashboardAnalytics({
    range,
    view: 'traffic',
  });

  useEffect(() => {
    if (typeof refreshSignal !== 'number') return;
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;
    void refresh();
  }, [refresh, refreshSignal]);

  const rangeLabel = useMemo(() => {
    return range === '7d' ? 'Last 7 days' : 'Last 30 days';
  }, [range]);

  // Run count-up animation when data changes
  useEffect(() => {
    const duration = 800; // ms
    const startValue = displayProfileViews;
    const endValue = data?.profile_views ?? 0;
    const startTime = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const nextValue = Math.round(
        startValue + (endValue - startValue) * eased
      );
      setDisplayProfileViews(nextValue);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const profileViewsLabel = useMemo(() => {
    const value = displayProfileViews;
    return Intl.NumberFormat().format(value);
  }, [displayProfileViews]);

  const uniqueUsersLabel = useMemo(() => {
    const value = data?.unique_users ?? 0;
    return Intl.NumberFormat().format(value);
  }, [data?.unique_users]);

  const showInitialSkeleton = loading && !data;
  const showEmpty =
    !showInitialSkeleton &&
    !error &&
    (data?.profile_views ?? 0) === 0 &&
    (data?.unique_users ?? 0) === 0;

  const errorCards = (
    <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
      <DashboardCard variant='analytics'>
        <div className='flex h-full min-h-[164px] flex-col justify-between'>
          <div className='space-y-2'>
            <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
              Profile views
            </p>
            <p className='text-sm font-medium text-primary-token'>
              Analytics temporarily unavailable
            </p>
            <p className='text-xs text-secondary-token'>
              We couldn&apos;t fetch your analytics data right now
            </p>
          </div>

          <p className='mt-4 text-xs text-tertiary-token'>
            Refresh to try again.
          </p>
        </div>
      </DashboardCard>

      <DashboardCard variant='analytics'>
        <div className='flex h-full min-h-[164px] flex-col justify-between'>
          <div className='space-y-2'>
            <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
              Audience
            </p>
            <p className='text-sm font-medium text-primary-token'>
              Analytics temporarily unavailable
            </p>
            <p className='text-xs text-secondary-token'>
              We couldn&apos;t fetch your analytics data right now
            </p>
          </div>

          <p className='mt-4 text-xs text-tertiary-token'>
            Refresh to try again.
          </p>
        </div>
      </DashboardCard>
    </div>
  );

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

  return (
    <div className='space-y-3'>
      <div className='min-h-[196px]'>
        {showInitialSkeleton ? (
          <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          errorCards
        ) : showEmpty ? (
          <div className='min-h-[196px]'>
            <EmptyState
              type='analytics'
              title='No profile views yet'
              description='Share your profile link to start tracking clicks and engagement from your fans.'
              actionLabel={copied ? 'Copied!' : 'Copy Profile Link'}
              onAction={profileUrl ? handleCopy : undefined}
            />
          </div>
        ) : (
          <div
            className={refreshing ? 'opacity-70 transition-opacity' : undefined}
          >
            <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
              <AnalyticsCard
                title='Profile views'
                value={profileViewsLabel}
                metadata={rangeLabel}
                icon={ChartBarIcon}
                iconClassName='text-sky-600 dark:text-sky-400'
                iconChipClassName='bg-sky-500/10 dark:bg-sky-500/15'
              />

              <AnalyticsCard
                title='Audience'
                value={uniqueUsersLabel}
                metadata={rangeLabel}
                icon={UserGroupIcon}
                iconClassName='text-emerald-600 dark:text-emerald-400'
                iconChipClassName='bg-emerald-500/10 dark:bg-emerald-500/15'
              >
                <div className='flex items-center justify-between'>
                  <p className='text-xs text-tertiary-token'>Unique users</p>
                  <Link
                    href='/app/dashboard/audience'
                    className='text-xs font-semibold text-primary-token underline-offset-2 hover:underline'
                  >
                    View audience
                  </Link>
                </div>
              </AnalyticsCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
