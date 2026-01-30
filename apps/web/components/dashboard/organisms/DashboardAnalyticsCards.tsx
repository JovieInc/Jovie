'use client';

import { Button } from '@jovie/ui';
import { BarChart3, Users } from 'lucide-react';
import Link from 'next/link';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { EmptyState } from '@/components/organisms/EmptyState';
import { captureError } from '@/lib/error-tracking';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import type { AnalyticsRange } from '@/types/analytics';
import { AnalyticsCard } from '../atoms/AnalyticsCard';

type CityRange = Extract<AnalyticsRange, '7d' | '30d' | '90d'>;

// Clipboard feedback delay in milliseconds
const CLIPBOARD_FEEDBACK_DELAY_MS = 1500;
const ANIMATION_DURATION_MS = 800;
const REFRESH_BURST_THRESHOLD_MS = 400;
const LARGE_DELTA_THRESHOLD = 1000;
const DEFAULT_FRAME_INTERVAL_MS = 16;
const REDUCED_FRAME_INTERVAL_MS = 50;

// Reusable number formatter (created once, not on every render)
const numberFormatter = new Intl.NumberFormat();

function SkeletonCards() {
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
    <div className='grid grid-cols-2 gap-8'>
      {skeletonMetric}
      {skeletonMetric}
    </div>
  );
}

function ErrorCards() {
  return (
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
}

function getRangeLabel(range: CityRange): string {
  if (range === '7d') return 'Last 7 days';
  if (range === '30d') return 'Last 30 days';
  return 'Last 90 days';
}

function getEmptyStateAction(
  profileUrl: string | undefined,
  copied: boolean,
  onCopy: () => void
) {
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

interface DashboardAnalyticsCardsProps {
  profileUrl?: string;
  range?: CityRange;
  refreshSignal?: number;
}

export const DashboardAnalyticsCards = memo(function DashboardAnalyticsCards({
  profileUrl,
  range = '7d',
  refreshSignal,
}: Readonly<DashboardAnalyticsCardsProps>) {
  const notifications = useNotifications();
  const lastRefreshSignalRef = useRef<number>(
    typeof refreshSignal === 'number' ? refreshSignal : 0
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAnimationAtRef = useRef(0);
  const hasVisibilityInfoRef = useRef(false);

  const [displayProfileViews, setDisplayProfileViews] = useState(0);
  const displayProfileViewsRef = useRef(0);
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const { data, error, isLoading, isFetching, refetch } =
    useDashboardAnalyticsQuery({ range, view: 'traffic' });

  const refreshing = isFetching && !isLoading;

  useEffect(() => {
    if (typeof refreshSignal !== 'number') return;
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;
    refetch();
  }, [refetch, refreshSignal]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        hasVisibilityInfoRef.current = true;
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rangeLabel = useMemo(() => getRangeLabel(range), [range]);

  // Run count-up animation when profile_views changes
  useEffect(() => {
    const startValue = displayProfileViewsRef.current;
    const endValue = data?.profile_views ?? 0;

    // Skip animation if no change
    if (startValue === endValue) return;

    const startTime = performance.now();
    const timeSinceLastAnimation = startTime - lastAnimationAtRef.current;
    lastAnimationAtRef.current = startTime;

    if (
      (hasVisibilityInfoRef.current && !isVisible) ||
      timeSinceLastAnimation < REFRESH_BURST_THRESHOLD_MS
    ) {
      displayProfileViewsRef.current = endValue;
      setDisplayProfileViews(endValue);
      return;
    }

    const frameInterval =
      Math.abs(endValue - startValue) >= LARGE_DELTA_THRESHOLD
        ? REDUCED_FRAME_INTERVAL_MS
        : DEFAULT_FRAME_INTERVAL_MS;
    let raf = 0;
    let lastFrameTime = startTime;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / ANIMATION_DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const nextValue = Math.round(
        startValue + (endValue - startValue) * eased
      );

      if (now - lastFrameTime >= frameInterval || t === 1) {
        lastFrameTime = now;
        displayProfileViewsRef.current = nextValue;
        setDisplayProfileViews(nextValue);
      }
      if (t < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [data?.profile_views, isVisible]);

  const profileViewsLabel = useMemo(
    () => numberFormatter.format(displayProfileViews),
    [displayProfileViews]
  );

  const uniqueUsersLabel = useMemo(
    () => numberFormatter.format(data?.unique_users ?? 0),
    [data?.unique_users]
  );

  const handleCopy = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      notifications.success('Copied to clipboard', { duration: 2000 });
      setTimeout(() => setCopied(false), CLIPBOARD_FEEDBACK_DELAY_MS);
    } catch (e) {
      void captureError('Failed to copy profile URL to clipboard', e, {
        profileUrl,
        route: '/app/dashboard',
      });
      notifications.error('Failed to copy');
    }
  };

  const showInitialSkeleton = isLoading && !data;
  const showEmpty =
    !showInitialSkeleton &&
    !error &&
    (data?.profile_views ?? 0) === 0 &&
    (data?.unique_users ?? 0) === 0;

  const renderContent = () => {
    if (showInitialSkeleton) return <SkeletonCards />;
    if (error) return <ErrorCards />;
    if (showEmpty) {
      return (
        <EmptyState
          icon={<BarChart3 className='h-6 w-6' aria-hidden='true' />}
          heading='No profile views yet'
          description='Share your profile link to start tracking clicks and engagement from your fans.'
          action={getEmptyStateAction(
            profileUrl,
            copied,
            () => void handleCopy()
          )}
          secondaryAction={{ label: 'See sharing tips', href: '/support' }}
        />
      );
    }
    return (
      <div className={refreshing ? 'opacity-70 transition-opacity' : undefined}>
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
                className='text-xs font-medium text-accent-token hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary'
              >
                View audience
              </Link>
            </div>
          </AnalyticsCard>
        </div>
      </div>
    );
  };

  const refreshLabel = refreshing ? 'Refreshing…' : 'Refresh analytics';

  return (
    <div
      ref={containerRef}
      data-testid='dashboard-analytics-cards'
      className='space-y-4'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='space-y-0.5'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-tertiary-token'>
            Overview
          </p>
          <p className='text-xs text-secondary-token'>{rangeLabel}</p>
        </div>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => {
            refetch();
          }}
          disabled={refreshing}
          className='h-8 gap-2 px-3'
          aria-label='Refresh analytics overview'
        >
          <Icon
            name={refreshing ? 'Loader2' : 'RefreshCw'}
            className={
              refreshing
                ? 'h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
                : 'h-3.5 w-3.5'
            }
          />
          {refreshLabel}
        </Button>
      </div>
      {renderContent()}
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {displayProfileViews > 0 &&
          `Profile views: ${profileViewsLabel}, Unique users: ${uniqueUsersLabel}`}
      </div>
    </div>
  );
});
