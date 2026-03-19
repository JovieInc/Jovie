import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentUserProfile } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

/**
 * GET /api/dashboard/recent-releases
 *
 * Returns the 8 most recent releases for the current user's profile.
 * Lightweight query for the dashboard music import hero card.
 */
export async function GET() {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const releases = await db
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        artworkUrl: discogReleases.artworkUrl,
        releaseDate: discogReleases.releaseDate,
        releaseType: discogReleases.releaseType,
      })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, profile.id))
      .orderBy(desc(discogReleases.releaseDate))
      .limit(8);

    return NextResponse.json({ releases }, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
