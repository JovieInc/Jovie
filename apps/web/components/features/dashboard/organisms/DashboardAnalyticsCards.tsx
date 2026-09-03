'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { BarChart3, HelpCircle, Users } from 'lucide-react';
import Link from 'next/link';
import {
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import { getTimeRangeLabel } from '@/lib/analytics/time-range';
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
const OVERVIEW_METRIC_KEYS = ['profile-views', 'unique-visitors'] as const;

function OverviewMetricGrid({
  children,
  role,
  statusLabel,
}: Readonly<{
  children: ReactNode;
  role?: string;
  statusLabel?: string;
}>) {
  return (
    <div className='grid grid-cols-2 gap-2' role={role}>
      {statusLabel ? <span className='sr-only'>{statusLabel}</span> : null}
      {children}
    </div>
  );
}

function DashboardAnalyticsOverviewLoading() {
  return (
    <OverviewMetricGrid role='status' statusLabel='Loading Analytics Overview'>
      {OVERVIEW_METRIC_KEYS.map(key => (
        <ContentMetricCardSkeleton key={key} className='py-3.5' />
      ))}
    </OverviewMetricGrid>
  );
}

function DashboardAnalyticsOverviewError() {
  return (
    <OverviewMetricGrid
      role='alert'
      statusLabel='Analytics Overview Unavailable'
    >
      <ContentMetricCard
        as='section'
        label='Profile views'
        value='Temporarily unavailable'
        icon={BarChart3}
        iconClassName='text-info'
        valueClassName='text-app font-book leading-5 tracking-normal text-tertiary-token'
        aria-label='Profile views metric unavailable'
      />
      <ContentMetricCard
        as='section'
        label='Unique visitors'
        value='Temporarily unavailable'
        icon={Users}
        iconClassName='text-success'
        valueClassName='text-app font-book leading-5 tracking-normal text-tertiary-token'
        aria-label='Unique visitors metric unavailable'
      />
    </OverviewMetricGrid>
  );
}

function getEmptyStateAction(
  profileUrl: string | undefined,
  copied: boolean,
  onCopy: () => void
) {
  if (profileUrl) {
    return {
      label: copied ? 'Copied!' : 'Copy Profile Link',
      onClick: onCopy,
    };
  }
  return {
    label: 'Open Profile Settings',
    href: APP_ROUTES.CHAT,
  };
}

interface DashboardAnalyticsCardsProps {
  readonly profileUrl?: string;
  readonly range?: CityRange;
  readonly refreshSignal?: number;
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

  const rangeLabel = useMemo(
    () => getTimeRangeLabel(range, 'description'),
    [range]
  );

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
      notifications.success('Copied', { duration: 2000 });
      setTimeout(() => setCopied(false), CLIPBOARD_FEEDBACK_DELAY_MS);
    } catch (e) {
      void captureError('Failed to copy profile URL to clipboard', e, {
        profileUrl,
        route: APP_ROUTES.DASHBOARD,
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
    if (showInitialSkeleton) return <DashboardAnalyticsOverviewLoading />;
    if (error) return <DashboardAnalyticsOverviewError />;
    if (showEmpty) {
      return (
        <EmptyState
          icon={<BarChart3 className='h-5 w-5' aria-hidden='true' />}
          heading='No profile views yet'
          description='Share your profile link to start tracking clicks and engagement from your fans.'
          action={getEmptyStateAction(
            profileUrl,
            copied,
            () => void handleCopy()
          )}
          secondaryAction={{ label: 'See Sharing Tips', href: '/support' }}
        />
      );
    }
    return (
      <div className={refreshing ? 'opacity-70 transition-opacity' : undefined}>
        <div className='grid grid-cols-2 gap-2'>
          <AnalyticsCard
            title='Profile views'
            value={profileViewsLabel}
            metadata={rangeLabel}
            icon={BarChart3}
            iconClassName='text-info'
            headerRight={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type='button'
                    className='text-tertiary-token transition-colors hover:text-secondary-token'
                    aria-label='Learn More About Profile Views'
                  >
                    <HelpCircle className='h-3.5 w-3.5' />
                  </button>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-50'>
                  <p className='text-app'>
                    Total page views, including repeat visits from the same
                    person
                  </p>
                </TooltipContent>
              </Tooltip>
            }
          />
          <AnalyticsCard
            title='Unique visitors'
            value={uniqueUsersLabel}
            metadata={rangeLabel}
            icon={Users}
            iconClassName='text-success'
            headerRight={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type='button'
                    className='text-tertiary-token transition-colors hover:text-secondary-token'
                    aria-label='Learn More About Unique Visitors'
                  >
                    <HelpCircle className='h-3.5 w-3.5' />
                  </button>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-50'>
                  <p className='text-app'>
                    Individual people who visited your profile, counted once per
                    person
                  </p>
                </TooltipContent>
              </Tooltip>
            }
          >
            <div className='flex items-center justify-between'>
              <p className='text-app text-tertiary-token'>
                Identified audience
              </p>
              <Link
                href={APP_ROUTES.AUDIENCE}
                className='text-app font-caption text-accent-token hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary'
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
      className='space-y-1 min-h-35'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='space-y-0.5'>
          <p className='text-app font-caption tracking-normal text-secondary-token'>
            Overview
          </p>
          <p className='text-app text-secondary-token'>{rangeLabel}</p>
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
          aria-label='Refresh Analytics Overview'
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
          `Profile views: ${profileViewsLabel}, Unique visitors: ${uniqueUsersLabel}`}
      </div>
    </div>
  );
});
