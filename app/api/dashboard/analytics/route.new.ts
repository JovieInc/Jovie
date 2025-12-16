import { auth } from '@clerk/nextjs/server';
import { and, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clickEvents, creatorProfiles, users } from '@/lib/db/schema';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '30d';

  try {
    const now = new Date();
    let startDate = new Date();

    switch (range) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate = new Date(0); // Unix epoch
        break;
    }

    // Ensure we have a valid date
    if (isNaN(startDate.getTime())) {
      startDate = new Date(0); // Fallback to epoch if invalid date
    }

    // Calculate seven days ago for recent clicks
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Get all click events for the user in the specified date range
    const [creatorProfile] = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!creatorProfile) {
      return NextResponse.json(
        {
          total_clicks: 0,
          spotify_clicks: 0,
          social_clicks: 0,
          recent_clicks: 0,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const events = await db
      .select({
        linkType: clickEvents.linkType,
        createdAt: clickEvents.createdAt,
      })
      .from(clickEvents)
      .where(
        and(
          gte(clickEvents.createdAt, startDate),
          eq(clickEvents.creatorProfileId, creatorProfile.id)
        )
      );

    // Calculate metrics
    const totalClicks = events.length;
    const spotifyClicks = events.filter(e => e.linkType === 'listen').length;
    const socialClicks = events.filter(e => e.linkType === 'social').length;
    const recentClicks = events.filter(
      e => new Date(e.createdAt) >= sevenDaysAgo
    ).length;

    return NextResponse.json(
      {
        total_clicks: totalClicks,
        spotify_clicks: spotifyClicks,
        social_clicks: socialClicks,
        recent_clicks: recentClicks,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
