'use client';

import { ReleaseSmartLinkAnalytics } from '@/components/organisms/release-sidebar/ReleaseSmartLinkAnalytics';
import type { Release } from '@/components/organisms/release-sidebar/types';
import { buildLinkAnalyticsFixture } from './linkAnalyticsFixture';

const RELEASE: Release = {
  profileId: 'profile-northline',
  id: 'release-harbor',
  title: 'Harbor',
  status: 'released',
  slug: 'harbor',
  smartLinkPath: '/northline/harbor',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
};

/**
 * Shipped smart-link analytics panel with a fixed click fixture.
 * The override skips the dashboard fetch so the first render is ready.
 */
export function LinkAnalyticsSurface() {
  return (
    <ReleaseSmartLinkAnalytics
      analyticsOverride={buildLinkAnalyticsFixture()}
      release={RELEASE}
      variant='flat'
    />
  );
}
