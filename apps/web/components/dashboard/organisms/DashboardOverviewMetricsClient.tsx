'use client';

import { DashboardAnalyticsCards as AnalyticsCards } from '@/components/dashboard/organisms/DashboardAnalyticsCards';
import { useDashboardOverviewControls } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardActivityFeed } from '@/components/dashboard/organisms/dashboard-activity-feed';

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
