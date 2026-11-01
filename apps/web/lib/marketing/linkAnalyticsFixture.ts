import type { ReleaseSidebarAnalytics } from '@/components/organisms/release-sidebar/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed clock for the server render and hydration pass, so both agree even when
 * the browser clock is pinned. The client swaps in a wall-clock fixture after
 * mount.
 */
export const LINK_ANALYTICS_SSR_NOW = new Date('2026-10-29T12:00:00.000Z');

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
