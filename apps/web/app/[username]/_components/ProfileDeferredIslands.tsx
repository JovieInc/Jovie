'use client';

import dynamic from 'next/dynamic';

/**
 * JOV-10246: heavy public-profile islands that render nothing on first paint
 * and carry no artist-paid audience data. They mount after hydration from
 * their own chunk instead of adding hydration work ahead of the release
 * artwork (the profile LCP element).
 *
 * The view tracker, funnel beacon and Jovie/Meta pixels are deliberately NOT
 * here: artists pay for that audience (retargeting), including bounce-heavy
 * visits, so they stay in the entry bundle and fire right after hydration.
 * Guard: tests/unit/profile/profile-entry-bundle.test.ts
 */
export const DeferredAliasCollisionRecovery = dynamic(
  () =>
    import('@/components/features/profile/AliasCollisionRecovery').then(
      mod => mod.AliasCollisionRecovery
    ),
  { ssr: false }
);
