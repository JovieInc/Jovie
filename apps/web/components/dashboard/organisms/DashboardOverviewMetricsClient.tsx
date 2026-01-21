'use client';

import { DashboardAnalyticsCards as AnalyticsCards } from '@/components/dashboard/organisms/DashboardAnalyticsCards';
import { useDashboardOverviewControls } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardActivityFeed } from '@/components/dashboard/organisms/dashboard-activity-feed';

export interface DashboardOverviewMetricsClientProps {
  profileId: string;
  profileUrl?: string;
  showActivity?: boolean;
}

export function DashboardOverviewMetricsClient({
  profileId,
  profileUrl,
  showActivity = false,
}: DashboardOverviewMetricsClientProps): JSX.Element {
  const { range, refreshSignal } = useDashboardOverviewControls();

  return (
    <div className='space-y-6 px-3'>
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
