import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { cacheQuery, invalidateCache } from '@/lib/db/cache';
import { getUserDashboardAnalytics } from '@/lib/db/queries/analytics';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { logger } from '@/lib/utils/logger';
import type { AnalyticsRange, DashboardAnalyticsView } from '@/types/analytics';

type TimeRange = AnalyticsRange;

/** Map a retention-days limit to the maximum allowed AnalyticsRange. */
const RANGE_DAYS: Record<TimeRange, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: 365,
};

/** Clamp the requested range to the user's plan retention limit. */
function clampRange(requested: TimeRange, retentionDays: number): TimeRange {
  const requestedDays = RANGE_DAYS[requested];
  if (requestedDays <= retentionDays) return requested;

  // Find the largest range that fits within retention
  const ranges: TimeRange[] = ['1d', '7d', '30d', '90d', 'all'];
  let best: TimeRange = '1d';
  for (const r of ranges) {
    if (RANGE_DAYS[r] <= retentionDays) best = r;
  }
  return best;
}

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isRange(value: string): value is TimeRange {
  return (
    value === '1d' ||
    value === '7d' ||
    value === '30d' ||
    value === '90d' ||
    value === 'all'
  );
}

function isView(value: string): value is DashboardAnalyticsView {
  return value === 'traffic' || value === 'full';
}

export async function GET(request: Request) {
  try {
    const userId = await requireAuth();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get('range');
    const viewParam = searchParams.get('view');
    const refreshParam = searchParams.get('refresh');

    const rawRange: TimeRange =
      rangeParam && isRange(rangeParam) ? rangeParam : '30d';
    const view: DashboardAnalyticsView =
      viewParam && isView(viewParam) ? viewParam : 'full';
    const forceRefresh = refreshParam === '1';

    // Clamp date range to user's plan retention limit.
    // Cache the entitlement lookup (5 min TTL) to avoid repeated billing
    // round-trips on every analytics fetch.
    const entitlementsTimer = 'db:dashboard-analytics:entitlementsRange';
    console.time(entitlementsTimer);
    const retentionDays = await cacheQuery(
      `analytics-retention:${userId}`,
      async () => {
        try {
          const entitlements = await getCurrentUserEntitlements();
          return entitlements.analyticsRetentionDays;
        } catch {
          // Billing unavailable — use free-tier default (7 days)
          return 7;
        }
      },
      { ttlSeconds: 5 * 60 }
    );
    const range = clampRange(rawRange, retentionDays);
    console.timeEnd(entitlementsTimer);

    const key = `dashboard-analytics:${userId}:${view}:${range}`;

    if (forceRefresh) {
      await invalidateCache(key);
    }

    const analyticsTimer = 'db:dashboard-analytics:getUserDashboardAnalytics';
    console.time(analyticsTimer);
    const payload = await cacheQuery(
      key,
      async () => {
        const analytics = await getUserDashboardAnalytics(userId, range, view);
        return {
          ...analytics,
          top_cities: analytics.top_cities ?? [],
          top_countries: analytics.top_countries ?? [],
          top_referrers: analytics.top_referrers ?? [],
          top_links: analytics.top_links ?? [],
        };
      },
      { ttlSeconds: 60 }
    );
    console.timeEnd(analyticsTimer);

    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('Error in analytics API:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Gracefully handle missing user/profile by returning zeroed stats
    if (
      error instanceof Error &&
      (error.message.includes('User not found for Clerk ID') ||
        error.message.includes('Creator profile not found'))
    ) {
      return NextResponse.json(
        {
          profile_views: 0,
          unique_users: 0,
          top_cities: [],
          top_countries: [],
          top_referrers: [],
          top_links: [],
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Capture unexpected errors in Sentry
    Sentry.captureException(error, {
      tags: {
        route: '/api/dashboard/analytics',
        errorType: 'api_error',
      },
    });

    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
