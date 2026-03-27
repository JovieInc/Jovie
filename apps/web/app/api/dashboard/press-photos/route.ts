import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { getPressPhotosByUserId } from '@/lib/db/queries/press-photos';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get('profileId');

    if (!profileId) {
      return NextResponse.json(
        { error: 'Missing profileId' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return withDbSessionTx(async (tx, clerkUserId) => {
      const dbUser = await getUserByClerkId(tx, clerkUserId);

      if (!dbUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const [profile] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(
          and(
            eq(creatorProfiles.id, profileId),
            eq(creatorProfiles.userId, dbUser.id)
          )
        )
        .limit(1);

      if (!profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const pressPhotos = await getPressPhotosByUserId(dbUser.id, profileId);

      return NextResponse.json(pressPhotos, { headers: NO_STORE_HEADERS });
    });
  } catch (error) {
    logger.error('[press-photos] Failed to load press photos:', error);
    return NextResponse.json(
      { error: 'Failed to load press photos' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
