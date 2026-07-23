import { and, asc, eq, ilike, isNull, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSessionContext,
  isUnauthorizedSessionError,
} from '@/lib/auth/session';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

const MAX_RESULTS = 5;

const searchParamsSchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().positive().default(MAX_RESULTS),
});

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

export async function GET(request: Request) {
  try {
    const { profile } = await getSessionContext({ requireProfile: true });
    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const profileHandle =
      profile.usernameNormalized?.trim() || profile.username?.trim();
    if (!profileHandle) {
      throw new TypeError('Authenticated profile handle is unavailable');
    }

    const url = new URL(request.url);
    const parsed = searchParamsSchema.safeParse({
      q: url.searchParams.get('q') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid search parameters' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const limit = Math.min(parsed.data.limit, MAX_RESULTS);
    const normalizedQuery = parsed.data.q.toLocaleLowerCase();
    const artistNames = [
      profile.displayName,
      profile.username,
      profile.usernameNormalized,
    ].filter((value): value is string => Boolean(value?.trim()));
    const queryMatchesArtist = artistNames.some(name =>
      name.toLocaleLowerCase().includes(normalizedQuery)
    );
    const filters = [
      eq(discogReleases.creatorProfileId, profile.id),
      isNull(discogReleases.deletedAt),
      ne(discogReleases.status, 'draft'),
    ];
    if (!queryMatchesArtist) {
      filters.push(
        ilike(discogReleases.title, `%${escapeLikePattern(parsed.data.q)}%`)
      );
    }

    const releases = await db
      .select({
        id: discogReleases.id,
        slug: discogReleases.slug,
        title: discogReleases.title,
      })
      .from(discogReleases)
      .where(and(...filters))
      .orderBy(asc(discogReleases.title), asc(discogReleases.id))
      .limit(limit);
    const artistName = profile.displayName?.trim() || profileHandle;

    return NextResponse.json(
      {
        releases: releases.map(release => ({
          id: release.id,
          title: release.title,
          artistNames: artistName ? [artistName] : [],
          smartLinkPath: buildSmartLinkPath(profileHandle, release.slug),
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isUnauthorizedSessionError(error)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    logger.error('Header search failed:', error);
    await captureError('Header search failed', error, {
      route: '/api/search/header',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Search unavailable' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
