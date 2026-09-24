import 'server-only';

import {
  clampRangeToRetention,
  isAnalyticsRange,
} from '@/lib/analytics/time-range';
import { cacheQuery, invalidateCache } from '@/lib/db/cache';
import { getUserDashboardAnalytics } from '@/lib/db/queries/analytics';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';

/**
 * One authorized analytics read for the dashboard API, the mobile API, and
 * the artist agent. Callers authenticate the user first. This function
 * applies plan retention, then loads the canonical dashboard query. A
 * billing lookup failure uses the 7-day fallback so a caller cannot widen
 * the window by skipping entitlements.
 */
const RETENTION_CACHE_TTL_SECONDS = 5 * 60;
const ANALYTICS_CACHE_TTL_SECONDS = 60;
const BILLING_UNAVAILABLE_RETENTION_DAYS = 7;
const DEFAULT_RANGE: AnalyticsRange = '30d';
const DEFAULT_VIEW: DashboardAnalyticsView = 'full';

export interface AuthorizedDashboardAnalytics {
  readonly range: AnalyticsRange;
  readonly view: DashboardAnalyticsView;
  readonly analytics: DashboardAnalyticsResponse;
}

function isView(value: string): value is DashboardAnalyticsView {
  return value === 'traffic' || value === 'full';
}

function normalizeAnalytics(
  analytics: DashboardAnalyticsResponse
): DashboardAnalyticsResponse {
  return {
    ...analytics,
    top_cities: analytics.top_cities ?? [],
    top_countries: analytics.top_countries ?? [],
    top_referrers: analytics.top_referrers ?? [],
    top_links: analytics.top_links ?? [],
  };
}

async function resolveRetentionDays(userId: string): Promise<number | null> {
  return cacheQuery(
    `analytics-retention:${userId}`,
    async () => {
      try {
        const entitlements = await getCurrentUserEntitlements();
        return entitlements.analyticsRetentionDays;
      } catch {
        return BILLING_UNAVAILABLE_RETENTION_DAYS;
      }
    },
    { ttlSeconds: RETENTION_CACHE_TTL_SECONDS }
  );
}

export async function readAuthorizedDashboardAnalytics(input: {
  readonly userId: string;
  readonly range?: string | null;
  readonly view?: string | null;
  readonly forceRefresh?: boolean;
}): Promise<AuthorizedDashboardAnalytics> {
  if (!input.userId) {
    throw new Error('Unauthorized');
  }

  const requestedRange: AnalyticsRange =
    input.range && isAnalyticsRange(input.range) ? input.range : DEFAULT_RANGE;
  const view: DashboardAnalyticsView =
    input.view && isView(input.view) ? input.view : DEFAULT_VIEW;
  const retentionDays = await resolveRetentionDays(input.userId);
  const range =
    retentionDays === null
      ? requestedRange
      : clampRangeToRetention(requestedRange, retentionDays);
  const cacheKey = `dashboard-analytics:${input.userId}:${view}:${range}`;

  if (input.forceRefresh) {
    await invalidateCache(cacheKey);
  }

  const analytics = await cacheQuery(
    cacheKey,
    async () =>
      normalizeAnalytics(
        await getUserDashboardAnalytics(input.userId, range, view)
      ),
    { ttlSeconds: ANALYTICS_CACHE_TTL_SECONDS }
  );

  return { range, view, analytics };
}

/**
 * Profile-view count the agent may quote. Same default window and retention
 * clamp as GET /api/dashboard/analytics.
 */
export async function readAuthorizedProfileViews(
  userId: string
): Promise<number> {
  const read = await readAuthorizedDashboardAnalytics({
    userId,
    range: DEFAULT_RANGE,
    view: 'traffic',
  });
  return read.analytics.profile_views ?? 0;
}
