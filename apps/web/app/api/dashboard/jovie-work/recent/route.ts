import { NextRequest, NextResponse } from 'next/server';
import { loadJovieWorkFeed } from '@/lib/activity/load-jovie-work-feed';
import { withDashboardRoute } from '@/lib/api/with-dashboard-route';
import { captureError } from '@/lib/error-tracking';
import { recentJovieWorkQuerySchema } from '@/lib/validation/schemas/dashboard/jovie-work';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
} as const;

export const GET = withDashboardRoute(async (ctx, request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const parsed = recentJovieWorkQuerySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    range: searchParams.get('range') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid jovie work feed request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { limit, range } = parsed.data;

  try {
    const items = await loadJovieWorkFeed({
      userId: ctx.user.id,
      creatorProfileId: ctx.profile.id,
      limit,
      range,
    });

    return NextResponse.json(
      { items },
      { status: 200, headers: CACHE_HEADERS }
    );
  } catch (error) {
    await captureError('Jovie work feed fetch failed', error, {
      route: '/api/dashboard/jovie-work/recent',
      method: 'GET',
      profileId: ctx.profile.id,
    });

    return NextResponse.json(
      { error: 'Failed to load Jovie work feed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
});
