import { DashboardSegmentSkeleton } from '@/components/shell/DashboardSegmentSkeleton';

/**
 * Identity route loading boundary (JOV-9024).
 *
 * The shell segment deliberately carries no loading.tsx, so a warm
 * navigation otherwise keeps the previous page mounted until the
 * destination resolves its server data — the Mac dogfood caught Home
 * rendered under the new active Identity state for the whole slow
 * Profiles fetch. This boundary lets the router commit the navigation
 * immediately and hold the profile-shaped skeleton in its place.
 * `resolveDashboardSegmentSkeletonVariant` maps every presence route to
 * the same 'profile' variant, so the loaded surface replaces reserved
 * geometry instead of shifting layout.
 */
export default function PresenceLoading() {
  return (
    <DashboardSegmentSkeleton
      variant='profile'
      rowKeyPrefix='presence-loading-row'
    />
  );
}
