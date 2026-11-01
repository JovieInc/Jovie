'use client';

import dynamic from 'next/dynamic';

/**
 * JOV-10246: non-visual public-profile islands (visit tracking, pixels,
 * funnel beacon, legacy alias recovery). Each renders no markup on first
 * paint, so it mounts after hydration from its own chunk instead of adding
 * hydration work ahead of the release artwork (the profile LCP element).
 * Guard: tests/unit/profile/profile-entry-bundle.test.ts
 */
export const DeferredProfileViewTracker = dynamic(
  () =>
    import('@/features/profile/ProfileViewTracker').then(
      mod => mod.ProfileViewTracker
    ),
  { ssr: false }
);

export const DeferredSignupFunnelBeacon = dynamic(
  () =>
    import('@/features/tracking/SignupFunnelBeacon').then(
      mod => mod.SignupFunnelBeacon
    ),
  { ssr: false }
);

export const DeferredJoviePixel = dynamic(
  () => import('@/features/tracking/JoviePixel').then(mod => mod.JoviePixel),
  { ssr: false }
);

export const DeferredMetaPixel = dynamic(
  () => import('@/features/tracking/MetaPixel').then(mod => mod.MetaPixel),
  { ssr: false }
);

export const DeferredAliasCollisionRecovery = dynamic(
  () =>
    import('@/components/features/profile/AliasCollisionRecovery').then(
      mod => mod.AliasCollisionRecovery
    ),
  { ssr: false }
);
