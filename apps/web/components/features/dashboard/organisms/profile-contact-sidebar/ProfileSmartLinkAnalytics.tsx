'use client';

import { useState } from 'react';
import { toast } from '@/components/feedback';
import {
  DrawerAnalyticsSummaryCard,
  type DrawerAnalyticsSummaryMetric,
  ShareableLinkRow,
} from '@/components/molecules/drawer';
import { copyToClipboard } from '@/hooks/useClipboard';
import { CANONICAL_METRICS } from '@/lib/analytics/metrics';
import { getTimeRangeLabel } from '@/lib/analytics/time-range';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';

const numberFormatter = new Intl.NumberFormat();

interface ProfileSmartLinkAnalyticsProps {
  readonly profileUrl: string;
  readonly variant?: 'card' | 'flat';
}

function ProfileSmartLinkControl({
  profileUrl,
}: {
  readonly profileUrl: string;
}) {
  return (
    <ShareableLinkRow
      url={profileUrl}
      density='rail'
      surface='boxed'
      testId='profile-smart-link-control'
      copyButtonTitle='Copy profile link'
      openButtonTitle='Open profile link'
      onCopy={async () => {
        if (!(await copyToClipboard(profileUrl))) {
          throw new Error('Failed to copy profile link');
        }
      }}
      onCopySuccess={() => toast.success('Profile link copied')}
      onCopyError={() => toast.error('Failed to copy link')}
    />
  );
}

/** Profile views and link clicks for the window, or none when both are zero. */
export function buildProfileSmartLinkMetrics(
  data: Pick<DashboardAnalyticsResponse, 'profile_views' | 'total_clicks'>,
  range: AnalyticsRange
): DrawerAnalyticsSummaryMetric[] {
  const views = data.profile_views ?? 0;
  const clicks = data.total_clicks ?? 0;
  if (views <= 0 && clicks <= 0) return [];

  const hint = getTimeRangeLabel(range, 'description');
  return [
    {
      id: 'profile-views',
      label: CANONICAL_METRICS.profile_views.label,
      value: numberFormatter.format(views),
      hint,
    },
    {
      // Display alias for CANONICAL_METRICS.total_clicks
      id: 'link-clicks',
      label: 'Link Clicks',
      value: numberFormatter.format(clicks),
      hint,
    },
  ];
}

export interface ProfileSmartLinkAnalyticsViewProps
  extends ProfileSmartLinkAnalyticsProps {
  readonly data: DashboardAnalyticsResponse | null | undefined;
  readonly range: AnalyticsRange;
  readonly loading: boolean;
  readonly isFetching?: boolean;
  readonly isError?: boolean;
}

/**
 * Profile drawer analytics on the shared DrawerAnalyticsSummaryCard, so its
 * tiles, loading skeleton and empty line match the release and tour-date
 * drawers, and the share link sits in a reserved footer that never moves.
 */
export function ProfileSmartLinkAnalyticsView({
  profileUrl,
  variant = 'card',
  data,
  range,
  loading,
  isFetching = false,
  isError = false,
}: ProfileSmartLinkAnalyticsViewProps) {
  let state: 'loading' | 'error' | 'ready' = 'ready';
  if (loading && !data) state = 'loading';
  else if (isError && !data) state = 'error';

  const metrics = data ? buildProfileSmartLinkMetrics(data, range) : [];
  const windowLabel = getTimeRangeLabel(range, 'description').toLowerCase();

  return (
    <DrawerAnalyticsSummaryCard
      metrics={metrics}
      state={state}
      dimmed={isFetching && state === 'ready'}
      emptyMessage={`No visits in the ${windowLabel}. Share your profile link to start counting views and clicks.`}
      errorMessage='Analytics unavailable'
      testId='profile-smart-link-analytics'
      variant={variant}
      stableLayout
      reserveFooterSlot
      metricSlotCount={2}
      footer={<ProfileSmartLinkControl profileUrl={profileUrl} />}
    />
  );
}

export function ProfileSmartLinkAnalytics({
  profileUrl,
  variant = 'card',
}: ProfileSmartLinkAnalyticsProps) {
  const [range] = useState<AnalyticsRange>('30d');
  const { data, isPending, isFetching, isError } = useDashboardAnalyticsQuery({
    range,
    view: 'traffic',
  });

  return (
    <ProfileSmartLinkAnalyticsView
      profileUrl={profileUrl}
      variant={variant}
      data={data}
      range={range}
      // isPending, not isLoading: offline with no cache the query is paused
      // (isLoading false), and "no visits" would claim zero during the wait.
      loading={isPending}
      isFetching={isFetching}
      isError={isError}
    />
  );
}
