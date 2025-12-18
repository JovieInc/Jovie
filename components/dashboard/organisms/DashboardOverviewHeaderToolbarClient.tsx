'use client';

import { DashboardOverviewToolbar } from '@/components/dashboard/organisms/DashboardOverviewToolbar';
import { useDashboardOverviewControls } from '@/components/dashboard/organisms/DashboardOverviewControlsProvider';

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
