'use client';

import { ReleaseSmartLinkAnalytics } from '@/components/organisms/release-sidebar/ReleaseSmartLinkAnalytics';
import type {
  Release,
  ReleaseSidebarAnalytics,
} from '@/components/organisms/release-sidebar/types';

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

const ANALYTICS: ReleaseSidebarAnalytics = {
  totalClicks: 1842,
  last7DaysClicks: 126,
  lastClickAt: '2026-08-20T15:04:00.000Z',
  providerClicks: [{ provider: 'spotify', clicks: 940 }],
};

/**
 * Shipped smart-link analytics panel with a fixed click fixture.
 * The override skips the dashboard fetch so the first render is ready.
 */
export function LinkAnalyticsSurface() {
  return (
    <ReleaseSmartLinkAnalytics
      analyticsOverride={ANALYTICS}
      release={RELEASE}
      variant='flat'
    />
  );
}
