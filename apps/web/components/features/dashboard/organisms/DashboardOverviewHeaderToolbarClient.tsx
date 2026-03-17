'use client';

import { useDashboardOverviewControls } from '@/features/dashboard/organisms/DashboardOverviewControlsProvider';
import { DashboardOverviewToolbar } from '@/features/dashboard/organisms/DashboardOverviewToolbar';

export function DashboardOverviewHeaderToolbarClient(): React.ReactElement {
  const { range, setRange, triggerRefresh } = useDashboardOverviewControls();

  return (
    <DashboardOverviewToolbar
      range={range}
      onRangeChange={setRange}
      onRefresh={triggerRefresh}
    />
  );
}
