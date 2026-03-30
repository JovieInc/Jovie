import { ReleaseTablePendingShell } from '@/features/dashboard/organisms/ReleaseTablePendingShell';

interface ReleaseTableSkeletonProps {
  readonly showHeader?: boolean;
  readonly testId?: string;
}

export function ReleaseTableSkeleton(
  props: Readonly<ReleaseTableSkeletonProps>
) {
  return <ReleaseTablePendingShell {...props} />;
}

/**
 * Default export for Next.js file-based loading state.
 * Automatically used as Suspense fallback during route navigation.
 */
export default function ReleasesLoading() {
  return <ReleaseTableSkeleton />;
}
