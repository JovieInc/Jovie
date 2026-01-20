'use client';

import { BarChart3, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SkeletonCard } from '@/components/molecules/SkeletonCard';
import { EmptyState } from '@/components/organisms/EmptyState';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import type { AnalyticsRange } from '@/types/analytics';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

type CityRange = Extract<AnalyticsRange, '7d' | '30d' | '90d'>;

// Clipboard feedback delay in milliseconds
const CLIPBOARD_FEEDBACK_DELAY_MS = 1500;
const COUNT_UP_DURATION_MS = 800;

/** Get human-readable range label */
function getRangeLabel(range: CityRange): string {
  if (range === '7d') return 'Last 7 days';
  if (range === '30d') return 'Last 30 days';
  return 'Last 90 days';
}

/** Skeleton loading cards */
function SkeletonCards() {
  return (
    <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

/** Single error card for unavailable analytics */
function ErrorCard({ title }: { title: string }) {
  return (
    <DashboardCard variant='analytics'>
      <div className='flex h-full min-h-[164px] flex-col justify-between'>
        <div className='space-y-2'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
            {title}
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
  );
}

/** Error state with two cards */
function ErrorCards() {
  return (
    <div className='grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2'>
      <ErrorCard title='Profile views' />
      <ErrorCard title='Audience' />
    </div>
  );
}

/** Build action config for empty state */
function buildEmptyStateAction(
  profileUrl: string | undefined,
  copied: boolean,
  onCopy: () => void
): { label: string; onClick?: () => void; href?: string } {
  if (profileUrl) {
    return {
      label: copied ? 'Copied!' : 'Copy profile link',
      onClick: onCopy,
    };
  }
  return {
    label: 'Open profile settings',
    href: '/app/dashboard/profile',
  };
}

/** Empty analytics state */
function EmptyAnalyticsState({
  profileUrl,
  copied,
  onCopy,
}: {
  profileUrl?: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className='min-h-[196px]'>
      <EmptyState
        icon={<BarChart3 className='h-6 w-6' aria-hidden='true' />}
        heading='No profile views yet'
        description='Share your profile link to start tracking clicks and engagement from your fans.'
        action={buildEmptyStateAction(profileUrl, copied, onCopy)}
        secondaryAction={{
          label: 'See sharing tips',
          href: '/support',
        }}
      />
    </div>
  );
}

/** Analytics cards grid with actual data */
function AnalyticsCardsContent({
  profileViewsLabel,
  uniqueUsersLabel,
  rangeLabel,
  refreshing,
}: {
  profileViewsLabel: string;
  uniqueUsersLabel: string;
  rangeLabel: string;
  refreshing: boolean;
}) {
  return (
    <div className={refreshing ? 'opacity-70 transition-opacity' : ''}>
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
  );
}

/** Calculate eased value for count-up animation */
function calculateEasedValue(
  startValue: number,
  endValue: number,
  progress: number
): number {
  // easeOutCubic
  const eased = 1 - (1 - progress) ** 3;
  return Math.round(startValue + (endValue - startValue) * eased);
}

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

  const [displayProfileViews, setDisplayProfileViews] = useState(0);
  const [copied, setCopied] = useState(false);

  const { data, error, isLoading, isFetching, refetch } =
    useDashboardAnalyticsQuery({ range, view: 'traffic' });

  const loading = isLoading;
  const refreshing = isFetching && !isLoading;

  useEffect(() => {
    if (typeof refreshSignal !== 'number') return;
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;
    refetch();
  }, [refetch, refreshSignal]);

  const rangeLabel = useMemo(() => getRangeLabel(range), [range]);

  // Run count-up animation when data changes
  useEffect(() => {
    const startValue = displayProfileViews;
    const endValue = data?.profile_views ?? 0;
    const startTime = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / COUNT_UP_DURATION_MS);
      setDisplayProfileViews(
        calculateEasedValue(startValue, endValue, progress)
      );
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, displayProfileViews]);

  const profileViewsLabel = useMemo(
    () => Intl.NumberFormat().format(displayProfileViews),
    [displayProfileViews]
  );

  const uniqueUsersLabel = useMemo(
    () => Intl.NumberFormat().format(data?.unique_users ?? 0),
    [data?.unique_users]
  );

  const showInitialSkeleton = loading && !data;
  const showEmpty =
    !showInitialSkeleton &&
    !error &&
    (data?.profile_views ?? 0) === 0 &&
    (data?.unique_users ?? 0) === 0;

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

  const renderContent = () => {
    if (showInitialSkeleton) return <SkeletonCards />;
    if (error) return <ErrorCards />;
    if (showEmpty) {
      return (
        <EmptyAnalyticsState
          profileUrl={profileUrl}
          copied={copied}
          onCopy={() => void handleCopy()}
        />
      );
    }
    return (
      <AnalyticsCardsContent
        profileViewsLabel={profileViewsLabel}
        uniqueUsersLabel={uniqueUsersLabel}
        rangeLabel={rangeLabel}
        refreshing={refreshing}
      />
    );
  };

  return (
    <div className='space-y-3' data-testid='dashboard-analytics-cards'>
      <div className='min-h-[196px]'>{renderContent()}</div>
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {displayProfileViews > 0 &&
          `Profile views: ${profileViewsLabel}, Unique users: ${uniqueUsersLabel}`}
      </div>
    </div>
  );
}
