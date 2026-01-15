'use client';

import { Zap } from 'lucide-react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useActivityFeedQuery } from '@/lib/queries';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type { DashboardActivityFeedProps } from './types';

const DASHBOARD_ACTIVITY_LOADING_KEYS = Array.from(
  { length: 4 },
  (_, i) => `dashboard-activity-loading-${i + 1}`
);

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
    <div className='space-y-4' data-testid='dashboard-activity-feed'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold leading-5 text-primary-token'>
            Activity
          </h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-2 rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-secondary-token'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-emerald-500'
          />
          Live
        </span>
      </div>

      <div className='min-h-[220px]'>
        {error ? (
          <div className='rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500'>
            {error.message || 'Failed to load activity'}
          </div>
        ) : isLoading ? (
          <div
            className='space-y-3 rounded-xl border border-subtle bg-surface-1/20 p-4'
            aria-busy='true'
          >
            {DASHBOARD_ACTIVITY_LOADING_KEYS.map(key => (
              <div
                key={key}
                className='flex items-center gap-3'
                aria-hidden='true'
              >
                <LoadingSkeleton
                  height='h-8'
                  width='h-8'
                  rounded='lg'
                  className='w-8'
                />
                <div className='flex-1 space-y-2'>
                  <LoadingSkeleton height='h-4' width='w-3/4' />
                  <LoadingSkeleton height='h-3' width='w-1/3' />
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
            <div className='rounded-xl border border-subtle bg-surface-1/20 p-4'>
              <div className='flex items-start gap-3'>
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1'>
                  <Zap className='h-5 w-5 text-secondary-token' />
                </div>

                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold leading-5 text-primary-token'>
                    No activity yet
                  </p>
                  <p className='mt-1 text-sm leading-5 text-secondary-token'>
                    Share your profile link to start tracking fan activity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={
              isRefreshing ? 'opacity-70 transition-opacity' : undefined
            }
          >
            <ul className='divide-y divide-white/5 overflow-hidden rounded-xl border border-subtle bg-surface-1/20'>
              {activities.map(activity => (
                <li
                  key={activity.id}
                  className='flex items-center gap-3 px-4 py-3'
                >
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
                      <span className='text-primary-token'>
                        {activity.description}
                      </span>
                    </p>
                  </div>
                </li>
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
