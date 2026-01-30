import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { getUserDashboardAnalytics } from '@/lib/db/queries/analytics';
import { logger } from '@/lib/utils/logger';
import type { AnalyticsRange, DashboardAnalyticsView } from '@/types/analytics';

type TimeRange = AnalyticsRange;

type CacheEntry = {
  payload: unknown;
  expiresAt: number;
};

// Cache TTL matches client-side staleTime (60s) to avoid unnecessary recomputation
const TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Prune expired entries and enforce max cache size using LRU eviction.
 * Called before adding new entries to prevent unbounded memory growth.
 */
function pruneCache(): void {
  const now = Date.now();

  // First pass: remove expired entries
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }

  // Second pass: if still over limit, remove oldest entries (LRU approximation)
  if (cache.size > MAX_CACHE_ENTRIES) {
    const entriesToRemove = cache.size - MAX_CACHE_ENTRIES;
    const keys = cache.keys();
    for (let i = 0; i < entriesToRemove; i++) {
      const { value: key, done } = keys.next();
      if (done) break;
      cache.delete(key);
    }
  }
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

function getCacheKey(
  userId: string,
  view: DashboardAnalyticsView,
  range: TimeRange
): string {
  return `dashboard-analytics:${userId}:${view}:${range}`;
}

export async function GET(request: Request) {
  try {
    return await withDbSession(async userId => {
      // Parse query parameters
      const { searchParams } = new URL(request.url);
      const rangeParam = searchParams.get('range');
      const viewParam = searchParams.get('view');
      const refreshParam = searchParams.get('refresh');

      const range: TimeRange =
        rangeParam && isRange(rangeParam) ? rangeParam : '30d';
      const view: DashboardAnalyticsView =
        viewParam && isView(viewParam) ? viewParam : 'full';
      const forceRefresh = refreshParam === '1';

      const key = getCacheKey(userId, view, range);
      const now = Date.now();
      const cached = cache.get(key);

      if (!forceRefresh && cached && cached.expiresAt > now) {
        return NextResponse.json(cached.payload, {
          status: 200,
          headers: NO_STORE_HEADERS,
        });
      }

      const existing = inflight.get(key);
      const promise =
        !forceRefresh && existing
          ? existing
          : (async () => {
              const analytics = await getUserDashboardAnalytics(
                userId,
                range,
                view
              );
              const payload = {
                ...analytics,
                top_cities: analytics.top_cities ?? [],
                top_countries: analytics.top_countries ?? [],
                top_referrers: analytics.top_referrers ?? [],
                top_links: analytics.top_links ?? [],
              } as const;
              return payload;
            })();

      if (!forceRefresh && !existing) {
        inflight.set(key, promise);
      }

      try {
        const payload = await promise;
        pruneCache();
        cache.set(key, { payload, expiresAt: Date.now() + TTL_MS });
        return NextResponse.json(payload, {
          status: 200,
          headers: NO_STORE_HEADERS,
        });
      } finally {
        if (inflight.get(key) === promise) {
          inflight.delete(key);
        }
      }
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
