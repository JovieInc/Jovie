import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { isPublicProfileDiscoveryEligible } from '@/lib/profile/public-profile-indexing-policy';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const querySchema = z.string().trim().min(2).max(80);

/** Reuse the public-profile discovery policy; never return owner or settings data. */
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    new URL(request.url).searchParams.get('q')
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Enter a name between 2 and 80 characters.' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  const rate = await publicArtistApiLimiter.limit(getClientIP(request));
  const headers = { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rate) };
  if (!rate.success)
    return NextResponse.json(
      { error: 'Search is temporarily unavailable.' },
      {
        status: rate.reason?.includes('temporarily unavailable') ? 503 : 429,
        headers,
      }
    );
  const pattern = `%${parsed.data.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  try {
    const candidates = await db
      .select({
        username: creatorProfiles.usernameNormalized,
        displayName: creatorProfiles.displayName,
        isPublic: creatorProfiles.isPublic,
        settings: creatorProfiles.settings,
        ownerEmail: users.email,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(creatorProfiles.userId, users.id))
      .where(
        and(
          eq(creatorProfiles.isPublic, true),
          or(
            ilike(creatorProfiles.displayName, pattern),
            ilike(creatorProfiles.usernameNormalized, pattern)
          )
        )
      )
      .orderBy(asc(creatorProfiles.usernameNormalized))
      .limit(30);
    const profiles = candidates
      .filter(profile =>
        isPublicProfileDiscoveryEligible(
          {
            ...profile,
            handle: profile.username,
          },
          { requirePublication: true, requireSearchability: true }
        )
      )
      .slice(0, 5)
      .map(profile => ({
        username: profile.username,
        name: profile.displayName,
      }));
    return NextResponse.json({ profiles }, { headers });
  } catch (error) {
    await captureError('Public profile search failed', error, {
      route: '/api/profile/search',
    });
    return NextResponse.json(
      { error: 'Search is temporarily unavailable.' },
      { status: 503, headers }
    );
  }
}
