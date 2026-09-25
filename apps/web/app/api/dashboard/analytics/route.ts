import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { readAuthorizedDashboardAnalytics } from '@/lib/analytics/authorized-read';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const { analytics } = await readAuthorizedDashboardAnalytics({
      userId,
      range: searchParams.get('range'),
      view: searchParams.get('view'),
      forceRefresh: searchParams.get('refresh') === '1',
    });

    return NextResponse.json(analytics, {
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
          unique_views: 0,
          unique_users: 0,
          tip_link_visits: 0,
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
