import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isPublicProfilePublished } from '@/lib/profile/public-profile-access';
import { isProfilePublicationCandidate } from '@/lib/routing/profile-publication-edge';
import { logger } from '@/lib/utils/logger';

/**
 * Fresh publication decision for the proxy's profile gate
 * (lib/routing/profile-publication-edge.ts, JOV-8629 §6.2). The canonical
 * profile document is ISR-cached; this endpoint is the per-request authority
 * that decides whether that cached body may be served. It is never cacheable:
 * every answer reads storage, and any failure is a 503 the proxy fails closed
 * on.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: Request) {
  const username = (new URL(req.url).searchParams.get('username') ?? '')
    .trim()
    .toLowerCase();
  if (!isProfilePublicationCandidate(username)) {
    return NextResponse.json(
      { published: false },
      { headers: NO_STORE, status: 400 }
    );
  }

  try {
    const [row] = await db
      .select({ isPublic: creatorProfiles.isPublic })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, username))
      .limit(1);
    return NextResponse.json(
      { published: Boolean(row) && isPublicProfilePublished(row?.isPublic) },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.error(
      'Profile publication decision failed',
      { error, username },
      'public-profile'
    );
    return NextResponse.json(
      { error: 'unavailable' },
      { headers: NO_STORE, status: 503 }
    );
  }
}
