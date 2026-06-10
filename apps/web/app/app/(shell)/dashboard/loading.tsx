import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';

/**
 * Dashboard segment loading state shown during client navigation between
 * dashboard sub-routes (e.g. audience -> contacts).
 */
export default function DashboardLoading() {
  return <DashboardSegmentSkeleton />;
}