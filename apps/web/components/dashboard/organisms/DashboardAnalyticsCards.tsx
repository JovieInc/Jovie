'use client';

import { BarChart3, Users } from 'lucide-react';
import Link from 'next/link';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '@/components/organisms/EmptyState';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import type { AnalyticsRange } from '@/types/analytics';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

type CityRange = Extract<AnalyticsRange, '7d' | '30d' | '90d'>;

// Clipboard feedback delay in milliseconds
const CLIPBOARD_FEEDBACK_DELAY_MS = 1500;

// Reusable number formatter (created once, not on every render)
const numberFormatter = new Intl.NumberFormat();

interface DashboardAnalyticsCardsProps {
  profileUrl?: string;
  range?: CityRange;
  refreshSignal?: number;
}

export const DashboardAnalyticsCards = memo(function DashboardAnalyticsCards({
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

  const { data, error, isLoading, isFetching, refetch } =
    useDashboardAnalyticsQuery({
      range,
      view: 'traffic',
    });

  const loading = isLoading;
  const refreshing = isFetching && !isLoading;

  useEffect(() => {
    if (typeof refreshSignal !== 'number') return;
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;
    // Fire-and-forget refetch - errors are handled by TanStack Query
    refetch();
  }, [refetch, refreshSignal]);

  const rangeLabel = useMemo(() => {
    if (range === '7d') return 'Last 7 days';
    if (range === '30d') return 'Last 30 days';
    return 'Last 90 days';
  }, [range]);

  // Track the current displayed value for animation start
  const displayedValueRef = useRef(0);

  // Run count-up animation when profile_views changes
  useEffect(() => {
    const duration = 800; // ms
    const startValue = displayedValueRef.current;
    const endValue = data?.profile_views ?? 0;

    // Skip animation if no change
    if (startValue === endValue) return;

    const startTime = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const eased = 1 - (1 - t) ** 3;
      const nextValue = Math.round(
        startValue + (endValue - startValue) * eased
      );
      displayedValueRef.current = nextValue;
      setDisplayProfileViews(nextValue);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [data?.profile_views]);

  const profileViewsLabel = useMemo(
    () => numberFormatter.format(displayProfileViews),
    [displayProfileViews]
  );

  const uniqueUsersLabel = useMemo(
    () => numberFormatter.format(data?.unique_users ?? 0),
    [data?.unique_users]
  );

  const showInitialSkeleton = loading && !data;
  const showEmpty =
    !showInitialSkeleton &&
    !error &&
    (data?.profile_views ?? 0) === 0 &&
    (data?.unique_users ?? 0) === 0;

  const errorCards = (
    <div className='grid grid-cols-2 gap-8'>
      <div className='space-y-2 py-1'>
        <div className='flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 dark:bg-sky-500/15'>
            <BarChart3 className='h-4 w-4 text-sky-600 dark:text-sky-400' />
          </div>
          <p className='text-xs font-medium text-secondary-token'>
            Profile views
          </p>
        </div>
        <p className='text-sm text-tertiary-token'>Temporarily unavailable</p>
      </div>

      <div className='space-y-2 py-1'>
        <div className='flex items-center gap-2'>
          <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15'>
            <Users className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
          </div>
          <p className='text-xs font-medium text-secondary-token'>Audience</p>
        </div>
        <p className='text-sm text-tertiary-token'>Temporarily unavailable</p>
      </div>
    </div>
  );

  const handleCopy = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      notifications.success('Copied to clipboard', { duration: 2000 });
      setTimeout(() => setCopied(false), CLIPBOARD_FEEDBACK_DELAY_MS);
    } catch (e) {
      console.error('Copy failed', e);
      notifications.error('Failed to copy');
    }
  };

  const skeletonMetric = (
    <div className='space-y-2 py-1 animate-pulse'>
      <div className='flex items-center gap-2'>
        <div className='h-7 w-7 rounded-lg bg-surface-2' />
        <div className='h-3 w-20 rounded bg-surface-2' />
      </div>
      <div className='h-8 w-16 rounded bg-surface-2' />
      <div className='h-3 w-24 rounded bg-surface-2' />
    </div>
  );

  return (
    <div data-testid='dashboard-analytics-cards'>
      {showInitialSkeleton ? (
        <div className='grid grid-cols-2 gap-8'>
          {skeletonMetric}
          {skeletonMetric}
        </div>
      ) : error ? (
        errorCards
      ) : showEmpty ? (
        <EmptyState
          icon={<BarChart3 className='h-6 w-6' aria-hidden='true' />}
          heading='No profile views yet'
          description='Share your profile link to start tracking clicks and engagement from your fans.'
          action={
            profileUrl
              ? {
                  label: copied ? 'Copied!' : 'Copy profile link',
                  onClick: () => void handleCopy(),
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
      ) : (
        <div
          className={refreshing ? 'opacity-70 transition-opacity' : undefined}
        >
          <div className='grid grid-cols-2 gap-8'>
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
                  className='text-xs font-medium text-accent-token hover:underline underline-offset-2'
                >
                  View audience
                </Link>
              </div>
            </AnalyticsCard>
          </div>
        </div>
      )}
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {displayProfileViews > 0 &&
          `Profile views: ${profileViewsLabel}, Unique users: ${uniqueUsersLabel}`}
      </div>
    </div>
  );
});
