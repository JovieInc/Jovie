'use client';

import { BarChart3, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SkeletonCard } from '@/components/molecules/SkeletonCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDashboardAnalytics } from '@/lib/hooks/useDashboardAnalytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { AnalyticsRange } from '@/types/analytics';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

type CityRange = Extract<AnalyticsRange, '7d' | '30d' | '90d'>;

interface DashboardAnalyticsCardsProps {
  profileUrl?: string;
  range?: CityRange;
  refreshSignal?: number;
}

export function DashboardAnalyticsCards({
  profileUrl,
  range = '7d',
  refreshSignal,
}: DashboardAnalyticsCardsProps) {
  const notifications = useNotifications();
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
    if (range === '7d') return 'Last 7 days';
    if (range === '30d') return 'Last 30 days';
    return 'Last 90 days';
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
      const eased = 1 - (1 - t) ** 3;
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
  }, [data, displayProfileViews]);

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
      notifications.success('Copied to clipboard', { duration: 2000 });
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed', e);
      notifications.error('Failed to copy');
    }
  };

  return (
    <div className='space-y-3' data-testid='dashboard-analytics-cards'>
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
              icon={<BarChart3 className='h-6 w-6' aria-hidden='true' />}
              heading='No profile views yet'
              description='Share your profile link to start tracking clicks and engagement from your fans.'
              action={
                profileUrl
                  ? {
                      label: copied ? 'Copied!' : 'Copy profile link',
                      onClick: handleCopy,
                    }
                  : {
                      label: 'Open profile settings',
                      href: '/app/dashboard/profile',
                    }
              }
              secondaryAction={{
                label: 'See sharing tips',
                href: '/support',
              }}
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
                icon={BarChart3}
                iconClassName='text-sky-600 dark:text-sky-400'
                iconChipClassName='bg-sky-500/10 dark:bg-sky-500/15'
              />

              <AnalyticsCard
                title='Audience'
                value={uniqueUsersLabel}
                metadata={rangeLabel}
                icon={Users}
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
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {displayProfileViews > 0 &&
          `Profile views: ${profileViewsLabel}, Unique users: ${uniqueUsersLabel}`}
      </div>
    </div>
  );
}
