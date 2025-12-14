'use client';

import { useDashboardOverviewControls } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardOverviewToolbar } from '@/components/dashboard/organisms/DashboardOverviewToolbar';

export function DashboardOverviewHeaderToolbarClient(): JSX.Element {
  const { range, setRange, triggerRefresh } = useDashboardOverviewControls();

  return (
    <DashboardOverviewToolbar
      range={range}
      onRangeChange={setRange}
      onRefresh={triggerRefresh}
    />
  );
}
