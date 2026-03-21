import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const revalidate = 3600; // Cache results for 1 hour

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const FEATURED_CREATORS_TIMEOUT_MS = 3000;

async function getFeaturedCreators() {
  const data = await withTimeout(
    db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        creatorType: creatorProfiles.creatorType,
      })
      .from(creatorProfiles)
      .where(
        and(
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isFeatured, true),
          eq(creatorProfiles.marketingOptOut, false)
        )
      )
      .orderBy(creatorProfiles.displayName)
      .limit(12),
    {
      timeoutMs: FEATURED_CREATORS_TIMEOUT_MS,
      context: 'Featured creators query',
      timeoutMessage: 'Featured creators query timed out',
    }
  );

  return data.map(a => ({
    id: a.id,
    handle: a.username,
    name: a.displayName || a.username,
    src: a.avatarUrl || '/android-chrome-192x192.png',
  }));
}

export async function GET() {
  try {
    const creators = await getFeaturedCreators();

    return NextResponse.json(creators, {
      headers: {
        'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=360',
      },
    });
  } catch (error) {
    logger.error('Error fetching featured creators:', error);
    await captureError('Featured creators fetch failed', error, {
      route: '/api/featured-creators',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load featured creators' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
