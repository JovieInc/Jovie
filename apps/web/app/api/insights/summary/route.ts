import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getInsightsSummary } from '@/lib/services/insights/lifecycle';

/**
 * GET /api/insights/summary
 *
 * Returns a lightweight summary of the top 3 insights for the dashboard widget.
 */
export async function GET() {
  try {
    const { profile } = await getSessionContext({ requireProfile: true });

    if (!profile) {
      return NextResponse.json(
        { insights: [], totalActive: 0, lastGeneratedAt: null },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const summary = await getInsightsSummary(profile.id);

    return NextResponse.json(summary, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
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
        { insights: [], totalActive: 0, lastGeneratedAt: null },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    Sentry.captureException(error, {
      tags: { route: '/api/insights/summary', method: 'GET' },
    });

    return NextResponse.json(
      { error: 'Failed to fetch insights summary' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
