'use client';

import { useEffect, useState } from 'react';
import { ReleaseSmartLinkAnalytics } from '@/components/organisms/release-sidebar/ReleaseSmartLinkAnalytics';
import type { Release } from '@/components/organisms/release-sidebar/types';
import {
  buildLinkAnalyticsFixture,
  LINK_ANALYTICS_SSR_NOW,
} from './linkAnalyticsFixture';

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
  // Hydrate from a fixed clock, then move the demo clicks onto the real "today"
  // so the last click never ages into "2mo ago" next to a 7-day count.
  const [analytics, setAnalytics] = useState(() =>
    buildLinkAnalyticsFixture(LINK_ANALYTICS_SSR_NOW)
  );
  useEffect(() => {
    setAnalytics(buildLinkAnalyticsFixture());
  }, []);

  return (
    <ReleaseSmartLinkAnalytics
      analyticsOverride={analytics}
      release={RELEASE}
      variant='flat'
    />
  );
}
