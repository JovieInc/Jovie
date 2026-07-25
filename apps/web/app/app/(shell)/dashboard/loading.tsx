import { headers } from 'next/headers';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import {
  resolveAppShellRequestPath,
  resolveDashboardSegmentSkeletonVariant,
} from '../shell-route-matches';

/**
 * Dashboard segment loading state shown during client navigation between
 * dashboard sub-routes (e.g. audience -> contacts).
 */
export default async function DashboardLoading() {
  const headerStore = await headers();
  const pathname = resolveAppShellRequestPath(
    headerStore.get('next-url'),
    headerStore.get('x-matched-path'),
    headerStore.get('x-invoke-path')
  );

  return (
    <DashboardSegmentSkeleton
      variant={resolveDashboardSegmentSkeletonVariant(pathname)}
    />
  );
}
