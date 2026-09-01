'use client';

import {
  Camera,
  DollarSign,
  Eye,
  Link2,
  Mail,
  MessageSquare,
  Music2,
  Zap,
} from 'lucide-react';
import { memo } from 'react';
import {
  ACTIVITY_TIMELINE_LIST_CLASSNAME,
  ACTIVITY_TIMELINE_PRIMARY_TEXT_CLASSNAME,
  ActivityFeedSkeleton,
  ActivityTimelineIcon,
  ActivityTimelineMeta,
  ActivityTimelineRow,
  ActivityTimelineTimestamp,
} from '@/components/molecules/ActivityFeed';
import { normalizeDashboardActivityIcon } from '@/lib/activity/dashboard-feed';
import { useActivityFeedQuery } from '@/lib/queries';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import type { Activity, DashboardActivityFeedProps } from './types';

const ACTIVITY_ICONS: Record<Activity['icon'], typeof Zap> = {
  listen: Music2,
  social: Camera,
  tip: DollarSign,
  link: Link2,
  visit: Eye,
  sms: MessageSquare,
  email: Mail,
};

function ActivityGlyph({ icon }: { readonly icon: Activity['icon'] }) {
  const normalizedIcon = normalizeDashboardActivityIcon(icon);
  const Icon = ACTIVITY_ICONS[normalizedIcon] ?? Link2;

  return <Icon className='h-3 w-3 text-tertiary-token' aria-hidden='true' />;
}

function ActivityEmptyState({
  isRefreshing,
}: {
  readonly isRefreshing: boolean;
}) {
  return (
    <div className={isRefreshing ? 'opacity-70 transition-opacity' : undefined}>
      <div className='flex min-h-35 items-center rounded-md bg-surface-1 px-2'>
        <p className='text-xs leading-[17px] text-secondary-token'>
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
      <ul className={ACTIVITY_TIMELINE_LIST_CLASSNAME}>
        {activities.map(activity => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </ul>
    </div>
  );
}

const ActivityItem = memo(function ActivityItem({
  activity,
}: {
  readonly activity: Activity;
}) {
  return (
    <ActivityTimelineRow
      as='li'
      href={activity.href}
      leading={
        <ActivityTimelineIcon>
          <ActivityGlyph icon={activity.icon} />
        </ActivityTimelineIcon>
      }
    >
      <p
        className={`${ACTIVITY_TIMELINE_PRIMARY_TEXT_CLASSNAME} text-primary-token`}
      >
        {activity.description}
      </p>
      <ActivityTimelineMeta>
        <ActivityTimelineTimestamp dateTime={activity.timestamp}>
          {formatTimeAgo(activity.timestamp)}
        </ActivityTimelineTimestamp>
      </ActivityTimelineMeta>
    </ActivityTimelineRow>
  );
});

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
    <div className='space-y-1.5' data-testid='dashboard-activity-feed'>
      <div className='flex items-center justify-between gap-4'>
        <div className='flex items-center gap-2'>
          <div className='flex h-6 w-6 items-center justify-center rounded-full bg-surface-0'>
            <Zap className='h-4 w-4 text-tertiary-token' aria-hidden='true' />
          </div>
          <h3 className='text-app font-caption tracking-tight text-secondary-token'>
            Activity
          </h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-1.5 text-2xs font-caption text-tertiary-token'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse'
          />
          <span>Live</span>
        </span>
      </div>

      <div className='min-h-45'>
        {(() => {
          if (error) {
            return (
              <p className='text-app text-error-token'>
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
