import { del } from '@vercel/blob';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

export const runtime = 'nodejs';

async function deletePressPhotoBlobs(urls: string[]): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token || urls.length === 0) {
    return;
  }

  await del(urls, { token });
}

export async function DELETE(
  _request: Request,
  context: Readonly<{ params: Promise<{ photoId: string }> }>
) {
  try {
    const { photoId } = await context.params;

    return withDbSessionTx(async (tx, clerkUserId) => {
      const dbUser = await getUserByClerkId(tx, clerkUserId);

      if (!dbUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const [photo] = await tx
        .select({
          id: profilePhotos.id,
          blobUrl: profilePhotos.blobUrl,
          smallUrl: profilePhotos.smallUrl,
          mediumUrl: profilePhotos.mediumUrl,
          largeUrl: profilePhotos.largeUrl,
          creatorProfileId: profilePhotos.creatorProfileId,
        })
        .from(profilePhotos)
        .where(
          and(
            eq(profilePhotos.id, photoId),
            eq(profilePhotos.userId, dbUser.id),
            eq(profilePhotos.photoType, 'press')
          )
        )
        .limit(1);

      if (!photo) {
        return NextResponse.json(
          { error: 'Press photo not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const [deleted] = await tx
        .delete(profilePhotos)
        .where(eq(profilePhotos.id, photo.id))
        .returning({
          id: profilePhotos.id,
          creatorProfileId: profilePhotos.creatorProfileId,
        });

      if (!deleted) {
        return NextResponse.json(
          { error: 'Press photo not found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      try {
        await deletePressPhotoBlobs(
          [
            photo.blobUrl,
            photo.smallUrl,
            photo.mediumUrl,
            photo.largeUrl,
          ].filter((url): url is string => Boolean(url))
        );
      } catch (error) {
        logger.error('[press-photos] Failed to delete blobs from storage', {
          photoId: photo.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (deleted.creatorProfileId) {
        const [profile] = await tx
          .select({ usernameNormalized: creatorProfiles.usernameNormalized })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, deleted.creatorProfileId))
          .limit(1);

        try {
          await invalidateProfileCache(profile?.usernameNormalized ?? null);
        } catch (error) {
          logger.error('[press-photos] Cache invalidation failed', {
            photoId: photo.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('[press-photos] Failed to delete press photo:', error);
    return NextResponse.json(
      { error: 'Failed to delete press photo' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
