import { DashboardOverviewSkeleton } from '@/features/dashboard/organisms/DashboardOverviewSkeleton';

/**
 * Dashboard overview loading screen
 * Uses content-matching overview skeleton while redirect resolves.
 */
export default function OverviewLoading() {
  return <DashboardOverviewSkeleton />;
}
