import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getActiveInsights } from '@/lib/services/insights/lifecycle';
import type { InsightCategory, InsightPriority } from '@/types/insights';

const VALID_CATEGORIES: InsightCategory[] = [
  'geographic',
  'growth',
  'content',
  'revenue',
  'tour',
  'platform',
  'engagement',
  'timing',
];

const VALID_PRIORITIES: InsightPriority[] = ['high', 'medium', 'low'];

/**
 * GET /api/insights
 *
 * Fetches active AI-generated insights for the authenticated user's creator profile.
 *
 * Query params:
 *  - category: comma-separated filter (e.g., "geographic,growth")
 *  - priority: comma-separated filter (e.g., "high,medium")
 *  - limit: number (default 20, max 50)
 *  - offset: number (default 0)
 */
export async function GET(request: Request) {
  try {
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { insights: [], total: 0, hasMore: false },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);

    // Parse category filter
    const categoryParam = searchParams.get('category');
    const categories = categoryParam
      ? categoryParam
          .split(',')
          .filter((c): c is InsightCategory =>
            VALID_CATEGORIES.includes(c as InsightCategory)
          )
      : undefined;

    // Parse priority filter
    const priorityParam = searchParams.get('priority');
    const priorities = priorityParam
      ? priorityParam
          .split(',')
          .filter((p): p is InsightPriority =>
            VALID_PRIORITIES.includes(p as InsightPriority)
          )
      : undefined;

    // Parse pagination
    const limit = Math.min(
      Math.max(1, Number(searchParams.get('limit')) || 20),
      50
    );
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

    const result = await getActiveInsights(profile.id, {
      category: categories,
      priority: priorities,
      limit,
      offset,
    });

    return NextResponse.json(
      {
        insights: result.insights,
        total: result.total,
        hasMore: offset + limit < result.total,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (
      error instanceof Error &&
      (error.message.includes('User not found') ||
        error.message.includes('Profile not found'))
    ) {
      return NextResponse.json(
        { insights: [], total: 0, hasMore: false },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    Sentry.captureException(error, {
      tags: { route: '/api/insights', method: 'GET' },
    });

    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
