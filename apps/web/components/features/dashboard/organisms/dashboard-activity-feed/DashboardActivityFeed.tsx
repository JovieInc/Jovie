'use client';

import { Zap } from 'lucide-react';
import Link from 'next/link';
import { ActivityFeedSkeleton } from '@/components/molecules/ActivityFeed';
import { useActivityFeedQuery } from '@/lib/queries';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type { Activity, DashboardActivityFeedProps } from './types';

function ActivityEmptyState({
  isRefreshing,
}: {
  readonly isRefreshing: boolean;
}) {
  return (
    <div className={isRefreshing ? 'opacity-70 transition-opacity' : undefined}>
      <div className='flex min-h-[140px] items-center rounded-[8px] border border-subtle bg-surface-1 px-3'>
        <p className='text-[12px] leading-[17px] text-secondary-token'>
          No recent activity. Share your profile to see engagement here.
        </p>
      </div>
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
        className='relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-base shadow-[0_0_0_3px_var(--linear-bg-surface-0)] group-hover:shadow-[0_0_0_3px_var(--linear-bg-surface-1)] group-focus-visible:shadow-[0_0_0_3px_var(--linear-bg-surface-1)]'
      >
        <span className='scale-90 text-tertiary-token'>{activity.icon}</span>
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-[13px] leading-5 tracking-[-0.01em] text-secondary-token'>
          <span className='tabular-nums text-tertiary-token'>
            {formatTimeAgo(activity.timestamp)}
          </span>
          <span className='text-tertiary-token'> - </span>
          <span className='text-primary-token'>{activity.description}</span>
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
          className='group relative flex items-start gap-3 rounded-[8px] px-2 py-2 transition-[background-color,box-shadow] duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
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
      <div className='group relative flex items-start gap-3 rounded-[8px] px-2 py-2'>
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
          <div className='flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-0 shadow-[0_0_0_3px_var(--linear-bg-surface-0)]'>
            <Zap className='h-3.5 w-3.5 text-tertiary-token' />
          </div>
          <h3 className='text-[13px] font-[510] tracking-[-0.01em] text-secondary-token'>
            Activity
          </h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-1.5 text-[11px] font-[510] text-tertiary-token'>
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
            return <ActivityFeedSkeleton rows={4} />;
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
