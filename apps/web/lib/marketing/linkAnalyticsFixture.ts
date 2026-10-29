import type { ReleaseSidebarAnalytics } from '@/components/organisms/release-sidebar/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Demo smart-link analytics for the product page. The last click is anchored
 * to the UTC day start (so it reads as hours ago, inside the 7-day window the
 * hint reports) and stays stable within a day for server and client renders.
 */
export function buildLinkAnalyticsFixture(
  now: Date = new Date()
): ReleaseSidebarAnalytics {
  const lastClickAt = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
  return {
    totalClicks: 1842,
    last7DaysClicks: 126,
    lastClickAt: lastClickAt.toISOString(),
    providerClicks: [{ provider: 'spotify', clicks: 940 }],
  };
}
