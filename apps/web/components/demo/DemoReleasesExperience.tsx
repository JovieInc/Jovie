'use client';

import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DemoAuthShell } from './DemoAuthShell';
import { DemoRealReleasesPanel } from './DemoRealReleasesPanel';

/**
 * DemoReleasesExperience — the full demo page content wrapped in the real
 * authenticated app shell (sidebar, header, nav) fed by mock data.
 *
 * Accepts optional dashboardData from a server component that fetches
 * a featured creator from the DB via getDemoCreator().
 */
export function DemoReleasesExperience({
  dashboardData,
}: {
  readonly dashboardData?: DashboardData;
} = {}) {
  return (
    <DemoAuthShell dashboardData={dashboardData}>
      <DemoRealReleasesPanel />
    </DemoAuthShell>
  );
}
