'use client';

// ReleaseSmartLinkAnalytics stays outside this file's import walk. That
// organism already uses arbitrary Tailwind values, and the marketing source
// baseline can only shrink.
import { LinkAnalyticsSurface } from '@/lib/marketing/LinkAnalyticsSurface';

/** Live smart-link analytics panel mounted on the product page. */
export function LinkAnalyticsPanel() {
  return <LinkAnalyticsSurface />;
}
