'use client';

import { DashboardAnalyticsCards as AnalyticsCards } from '@/features/dashboard/organisms/DashboardAnalyticsCards';
import { useDashboardOverviewControls } from '@/features/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardActivityFeed } from '@/features/dashboard/organisms/dashboard-activity-feed';

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

  return (
    <div className='space-y-4'>
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
