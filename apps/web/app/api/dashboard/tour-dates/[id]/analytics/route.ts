import * as Sentry from '@sentry/nextjs';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSessionContext, requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getTourDateAnalytics } from '@/lib/db/queries/analytics';
import { tourDates } from '@/lib/db/schema/tour';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: tourDateId } = await params;

    if (!tourDateId || !UUID_REGEX.test(tourDateId)) {
      return NextResponse.json(
        { error: 'Invalid tour date ID' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Get the creator profile for this user
    const { profile } = await getSessionContext({
      clerkUserId: userId,
      requireUser: true,
      requireProfile: false,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Verify the tour date exists AND belongs to this profile (ownership check)
    const [tourDate] = await db
      .select({ id: tourDates.id })
      .from(tourDates)
      .where(
        and(eq(tourDates.id, tourDateId), eq(tourDates.profileId, profile.id))
      )
      .limit(1);

    if (!tourDate) {
      return NextResponse.json(
        { error: 'Tour date not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const analytics = await getTourDateAnalytics(tourDateId, profile.id);

    return NextResponse.json(analytics, {
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

    Sentry.captureException(error, {
      tags: {
        route: '/api/dashboard/tour-dates/[id]/analytics',
        errorType: 'api_error',
      },
    });

    return NextResponse.json(
      { error: 'Failed to fetch tour date analytics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
