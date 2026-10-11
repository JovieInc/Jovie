import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isUnauthorizedSessionError,
  withDbSessionTx,
} from '@/lib/auth/session';
import { profileSurfaces } from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { readSourceIdentity } from '@/lib/profile-surfaces/source-identity';
import { createRateLimitHeaders, generalLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> }
) {
  try {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid profile' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    // Resolve the canonical URL under owner authorization. External I/O happens after the transaction closes.
    const result = await withDbSessionTx(async (tx, userId) => {
      const limit = await generalLimiter.limit(userId);
      if (!limit.success) return { limit, surface: null };
      const [surface] = await tx
        .select({ url: profileSurfaces.url })
        .from(profileSurfaces)
        .innerJoin(
          creatorProfiles,
          eq(creatorProfiles.id, profileSurfaces.creatorProfileId)
        )
        .leftJoin(
          userProfileClaims,
          and(
            eq(userProfileClaims.creatorProfileId, creatorProfiles.id),
            eq(userProfileClaims.userId, userId),
            eq(userProfileClaims.role, 'owner')
          )
        )
        .where(
          and(
            eq(profileSurfaces.id, parsed.data.id),
            isNull(profileSurfaces.retiredAt),
            or(
              eq(creatorProfiles.userId, userId),
              isNotNull(userProfileClaims.id)
            )
          )
        )
        .limit(1);
      return { limit, surface };
    });
    if (!result.limit.success)
      return NextResponse.json(
        { error: 'Try again later' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(result.limit),
          },
        }
      );
    if (!result.surface)
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    return NextResponse.json(await readSourceIdentity(result.surface.url), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (isUnauthorizedSessionError(error))
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    await captureError('Profile source inspection failed', error, {
      route: '/api/profile-surfaces/[id]/source',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Source unavailable' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
