import { headers } from 'next/headers';
import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';
import {
  resolveAppShellRequestPath,
  resolveDashboardSegmentSkeletonVariant,
} from '../shell-route-matches';

/**
 * Contacts segment loading state shown while /app/contacts streams (JOV-8791).
 * The /app/audience redirect lands here, so this route must have its own
 * loading state instead of falling back to a blank segment.
 */
export default async function ContactsLoading() {
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
