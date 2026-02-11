import { DashboardOverviewSkeleton } from '@/components/dashboard/organisms/DashboardOverviewSkeleton';

/**
 * Dashboard loading screen
 * Uses content-matching skeleton to prevent layout shift on mobile and desktop
 */
export default function DashboardLoading() {
  return <DashboardOverviewSkeleton />;
}
