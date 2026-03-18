'use client';

import { useAuth } from '@clerk/nextjs';
import { FirstFanCelebration } from '@/features/dashboard/molecules/FirstFanCelebration';
import { DashboardAnalyticsCards as AnalyticsCards } from '@/features/dashboard/organisms/DashboardAnalyticsCards';
import { useDashboardOverviewControls } from '@/features/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardActivityFeed } from '@/features/dashboard/organisms/dashboard-activity-feed';
import { useDashboardAnalyticsQuery } from '@/lib/queries';

export interface DashboardOverviewMetricsClientProps {
  readonly profileId: string;
  readonly profileUrl?: string;
  readonly showActivity?: boolean;
}

export function DashboardOverviewMetricsClient({
  profileId,
  profileUrl,
  showActivity = false,
}: DashboardOverviewMetricsClientProps): React.ReactElement {
  const { range, refreshSignal } = useDashboardOverviewControls();
  const { userId } = useAuth();
  const { data: analytics } = useDashboardAnalyticsQuery({ range: 'all' });

  return (
    <div className='space-y-4'>
      {userId && analytics?.subscribers != null ? (
        <FirstFanCelebration
          subscriberCount={analytics.subscribers}
          userId={userId}
        />
      ) : null}

      <AnalyticsCards
        profileUrl={profileUrl}
        range={range}
        refreshSignal={refreshSignal}
      />

      {showActivity ? (
        <DashboardActivityFeed profileId={profileId} range={range} />
      ) : null}
    </div>
  );
}
