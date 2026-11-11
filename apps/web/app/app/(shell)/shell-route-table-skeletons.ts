'use client';

import dynamic from 'next/dynamic';

/*
 * Route skeletons that render the real `UnifiedTable`, for the shell
 * layout's boot fallback (`resolveShellRouteSkeleton`).
 *
 * The shell layout imports a skeleton for every shell route, so a static
 * import of these put the full table (TanStack Table, the virtualizer and the
 * column motion, about 170 KB) in the boot bundle of every shell page, chat
 * included, though only the releases, library and presence routes render them. Through
 * `next/dynamic` with SSR on, those routes still server-render the same
 * skeleton markup, Next preloads the chunk for the route that renders it, and
 * hydration keeps the server HTML in place until the chunk arrives, so the
 * skeleton never blanks or shifts. Every other route never fetches it.
 */

export const LibraryLoadingStateLazy = dynamic(
  () =>
    import('./library/LibraryLoadingState').then(
      module => module.LibraryLoadingState
    ),
  { ssr: true }
);

export const ProfilesRouteSkeletonLazy = dynamic(
  () =>
    import('./profiles/ProfilesRouteSkeleton').then(
      module => module.ProfilesRouteSkeleton
    ),
  { ssr: true }
);

export const ReleaseTableSkeletonLazy = dynamic(
  () =>
    import('./dashboard/releases/loading').then(
      module => module.ReleaseTableSkeleton
    ),
  { ssr: true }
);
