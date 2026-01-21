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

function ActivityItem({ activity }: { activity: Activity }) {
  const content = (
    <>
      <span
        aria-hidden='true'
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1 text-base'
      >
        {activity.icon}
      </span>
      <div className='min-w-0 flex-1'>
        <p className='text-sm leading-5 text-primary-token'>
          <span className='text-secondary-token tabular-nums'>
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
      <li>
        <Link
          href={activity.href}
          className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1/50'
        >
          {content}
        </Link>
      </li>
    );
  }

  return <li className='flex items-center gap-3 px-4 py-3'>{content}</li>;
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
          <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/15'>
            <Zap className='h-4 w-4 text-violet-600 dark:text-violet-400' />
          </div>
          <h3 className='text-xs font-medium text-secondary-token'>Activity</h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-tertiary-token'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse'
          />
          Live
        </span>
      </div>

      <div className='min-h-[180px]'>
        {error ? (
          <p className='text-sm text-error-token'>
            {error.message || 'Failed to load activity'}
          </p>
        ) : isLoading ? (
          <div className='space-y-2' aria-busy='true'>
            {DASHBOARD_ACTIVITY_LOADING_KEYS.map(key => (
              <div
                key={key}
                className='flex items-center gap-3 animate-pulse'
                aria-hidden='true'
              >
                <div className='h-7 w-7 rounded-lg bg-surface-2' />
                <div className='flex-1 space-y-1.5'>
                  <div className='h-3 w-3/4 rounded bg-surface-2' />
                  <div className='h-2.5 w-1/3 rounded bg-surface-2' />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div
            className={
              isRefreshing ? 'opacity-70 transition-opacity' : undefined
            }
          >
            <p className='text-sm text-tertiary-token'>
              No recent activity. Share your profile to see engagement here.
            </p>
          </div>
        ) : (
          <div
            className={
              isRefreshing ? 'opacity-70 transition-opacity' : undefined
            }
          >
            <ul className='space-y-1'>
              {activities.map(activity => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </ul>
          </div>
        )}
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
