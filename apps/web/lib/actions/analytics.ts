'use server';

/**
 * Server Actions for Dashboard Analytics
 *
 * This module centralizes analytics data fetching to ensure:
 * - Consistent caching via Next.js cache primitives
 * - Proper RLS enforcement via withDbSession
 * - No client-side fetching of server data
 *
 * @see agents.md Section 10.1 - Data Fetching Strategy
 */

import * as Sentry from '@sentry/nextjs';
import { unstable_noStore as noStore } from 'next/cache';
import { withDbSession } from '@/lib/auth/session';
import { getUserDashboardAnalytics } from '@/lib/db/queries/analytics';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
  DashboardAnalyticsView,
} from '@/types/analytics';

/**
 * Empty analytics response for error cases and missing data
 */
const EMPTY_ANALYTICS: DashboardAnalyticsResponse = {
  profile_views: 0,
  unique_users: 0,
  top_cities: [],
  top_countries: [],
  top_referrers: [],
};

/**
 * Type guard for valid analytics range values
 */
function isValidRange(value: string): value is AnalyticsRange {
  return ['1d', '7d', '30d', '90d', 'all'].includes(value);
}

/**
 * Type guard for valid analytics view values
 */
function isValidView(value: string): value is DashboardAnalyticsView {
  return value === 'traffic' || value === 'full';
}

export type FetchDashboardAnalyticsResult =
  | { success: true; data: DashboardAnalyticsResponse }
  | { success: false; error: string };

/**
 * Fetch dashboard analytics data for the authenticated user
 *
 * This server action replaces the client-side useDashboardAnalytics hook
 * for initial data loading. For refresh operations, call this action
 * via startTransition in client components.
 *
 * @param range - Time range for analytics ('1d', '7d', '30d', '90d', 'all')
 * @param view - Analytics view type ('traffic' or 'full')
 * @returns Analytics data or error response
 *
 * @example
 * // In a Server Component (initial load)
 * const result = await fetchDashboardAnalytics('7d', 'traffic');
 * if (result.success) {
 *   return <AnalyticsDisplay data={result.data} />;
 * }
 *
 * @example
 * // In a Client Component (refresh)
 * const [isPending, startTransition] = useTransition();
 * const refresh = () => {
 *   startTransition(async () => {
 *     const result = await fetchDashboardAnalytics('7d', 'traffic');
 *     if (result.success) setData(result.data);
 *   });
 * };
 */
export async function fetchDashboardAnalytics(
  range: string = '7d',
  view: string = 'traffic'
): Promise<FetchDashboardAnalyticsResult> {
  // Prevent caching of user-specific data
  noStore();

  const validRange: AnalyticsRange = isValidRange(range) ? range : '7d';
  const validView: DashboardAnalyticsView = isValidView(view)
    ? view
    : 'traffic';

  try {
    return await Sentry.startSpan(
      { op: 'server.action', name: 'fetchDashboardAnalytics' },
      async () => {
        const data = await withDbSession(async userId => {
          const analytics = await getUserDashboardAnalytics(
            userId,
            validRange,
            validView
          );

          return {
            ...analytics,
            top_cities: analytics.top_cities ?? [],
            top_countries: analytics.top_countries ?? [],
            top_referrers: analytics.top_referrers ?? [],
          };
        });

        return { success: true, data };
      }
    );
  } catch (error) {
    // Handle unauthorized access
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { success: false, error: 'Unauthorized' };
    }

    // Handle missing user/profile gracefully
    if (
      error instanceof Error &&
      (error.message.includes('User not found for Clerk ID') ||
        error.message.includes('Creator profile not found'))
    ) {
      return { success: true, data: EMPTY_ANALYTICS };
    }

    // Log unexpected errors to Sentry
    Sentry.captureException(error, {
      tags: {
        action: 'fetchDashboardAnalytics',
        range: validRange,
        view: validView,
      },
    });

    console.error('Error fetching analytics:', error);
    return { success: false, error: 'Failed to fetch analytics data' };
  }
}
