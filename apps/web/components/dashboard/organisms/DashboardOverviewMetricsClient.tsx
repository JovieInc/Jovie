'use client';

import { AnalyticsCards } from '@/components/dashboard/molecules/AnalyticsCards';
import { DashboardActivityFeed } from '@/components/dashboard/organisms/DashboardActivityFeed';
import { useDashboardOverviewControls } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';

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
    <div className='space-y-4'>
      <section className='rounded-2xl bg-surface-1/40 p-3 shadow-none'>
        <AnalyticsCards
          profileUrl={profileUrl}
          range={range}
          refreshSignal={refreshSignal}
        />
      </section>

      {showActivity ? (
        <section className='rounded-2xl bg-surface-1/40 p-3 shadow-none'>
          <DashboardActivityFeed
            profileId={profileId}
            range={range}
            refreshSignal={refreshSignal}
          />
        </section>
      ) : null}
    </div>
  );
}
