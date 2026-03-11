'use client';

import { Zap } from 'lucide-react';
import Link from 'next/link';
import { useActivityFeedQuery } from '@/lib/queries';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type { Activity, DashboardActivityFeedProps } from './types';

const DASHBOARD_ACTIVITY_LOADING_KEYS = Array.from(
  { length: 4 },
  (_, i) => `dashboard-activity-loading-${i + 1}`
);

function ActivityLoadingSkeleton() {
  return (
    <div className='space-y-2' aria-busy='true'>
      {DASHBOARD_ACTIVITY_LOADING_KEYS.map(key => (
        <div key={key} className='flex items-start gap-3' aria-hidden='true'>
          <div className='h-6 w-6 rounded-full skeleton' />
          <div className='flex-1 space-y-1.5 pt-0.5'>
            <div className='h-3 w-3/4 rounded skeleton' />
            <div className='h-2.5 w-1/3 rounded skeleton' />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityEmptyState({
  isRefreshing,
}: {
  readonly isRefreshing: boolean;
}) {
  return (
    <div className={isRefreshing ? 'opacity-70 transition-opacity' : undefined}>
      <p className='text-[13px] text-tertiary-token'>
        No recent activity. Share your profile to see engagement here.
      </p>
    </div>
  );
}

function ActivityList({
  activities,
  isRefreshing,
}: {
  readonly activities: Activity[];
  readonly isRefreshing: boolean;
}) {
  return (
    <div className={isRefreshing ? 'opacity-70 transition-opacity' : undefined}>
      <ul className='space-y-1'>
        {activities.map(activity => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </ul>
    </div>
  );
}

function ActivityItem({ activity }: { readonly activity: Activity }) {
  const content = (
    <>
      <span
        aria-hidden='true'
        className='relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-base shadow-[0_0_0_3px_var(--linear-bg-surface-0)]'
      >
        <span className='scale-90 text-(--linear-text-tertiary)'>
          {activity.icon}
        </span>
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-[13px] leading-5 tracking-[-0.01em] text-(--linear-text-secondary)'>
          <span className='tabular-nums text-(--linear-text-tertiary)'>
            {formatTimeAgo(activity.timestamp)}
          </span>
          <span className='text-(--linear-text-tertiary)'> - </span>
          <span className='text-(--linear-text-primary)'>
            {activity.description}
          </span>
        </p>
      </div>
    </>
  );

  if (activity.href) {
    return (
      <li className='relative'>
        <div
          aria-hidden='true'
          className='absolute left-3 top-0 bottom-0 w-px bg-(--linear-border-subtle)'
        />
        <Link
          href={activity.href}
          className='relative flex items-start gap-3 rounded-[8px] px-2 py-2 transition-[background-color,box-shadow] duration-150 hover:bg-(--linear-bg-surface-1) focus-visible:bg-(--linear-bg-surface-1) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className='relative'>
      <div
        aria-hidden='true'
        className='absolute left-3 top-0 bottom-0 w-px bg-(--linear-border-subtle)'
      />
      <div className='relative flex items-start gap-3 rounded-[8px] px-2 py-2'>
        {content}
      </div>
    </li>
  );
}

export function DashboardActivityFeed({
  profileId,
  range = '7d',
}: DashboardActivityFeedProps) {
  const {
    data: activities = [],
    isLoading,
    isFetching,
    error,
  } = useActivityFeedQuery({
    profileId,
    range,
  });

  const isRefreshing = isFetching && !isLoading;

  return (
    <div className='space-y-3' data-testid='dashboard-activity-feed'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-2'>
          <div className='flex h-6 w-6 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) shadow-[0_0_0_3px_var(--linear-bg-surface-0)]'>
            <Zap className='h-3.5 w-3.5 text-(--linear-text-tertiary)' />
          </div>
          <h3 className='text-[13px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary)'>
            Activity
          </h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-1.5 text-[11px] font-[510] text-(--linear-text-tertiary)'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse'
          />
          <span>Live</span>
        </span>
      </div>

      <div className='min-h-[180px]'>
        {(() => {
          if (error) {
            return (
              <p className='text-[13px] text-error-token'>
                {error.message || 'Failed to load activity'}
              </p>
            );
          }

          if (isLoading) {
            return <ActivityLoadingSkeleton />;
          }

          if (activities.length === 0) {
            return <ActivityEmptyState isRefreshing={isRefreshing} />;
          }

          return (
            <ActivityList activities={activities} isRefreshing={isRefreshing} />
          );
        })()}
      </div>
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {activities.length > 0 &&
          `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'} loaded`}
        {isRefreshing && 'Refreshing activity feed'}
        {error && `Error: ${error.message || 'Failed to load activity'}`}
      </div>
    </div>
  );
}
