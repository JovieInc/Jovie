'use client';

import { useCallback, useState } from 'react';
import { AnalyticsCards } from '@/components/dashboard/molecules/AnalyticsCards';
import { DashboardActivityFeed } from '@/components/dashboard/organisms/DashboardActivityFeed';
import { DashboardOverviewToolbar } from '@/components/dashboard/organisms/DashboardOverviewToolbar';

type DashboardOverviewRange = '7d' | '30d';

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
  const [range, setRange] = useState<DashboardOverviewRange>('7d');
  const [refreshSignal, setRefreshSignal] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshSignal(prev => prev + 1);
  }, []);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-end'>
        <DashboardOverviewToolbar
          range={range}
          onRangeChange={setRange}
          onRefresh={triggerRefresh}
        />
      </div>

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
