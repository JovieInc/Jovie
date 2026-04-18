import { and, desc, eq } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import { profilePhotos } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import {
  type AvatarQuality,
  resolveAvatarQuality,
  UNKNOWN_AVATAR_QUALITY,
} from '@/lib/profile/avatar-quality';

function isAvatarQualitySchemaUnavailableError(error: unknown): boolean {
  const directCode =
    error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  const causeCode =
    error instanceof Error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'code' in error.cause &&
    typeof error.cause.code === 'string'
      ? error.cause.code
      : null;

  return (
    directCode === '42P01' ||
    directCode === '42703' ||
    causeCode === '42P01' ||
    causeCode === '42703'
  );
}

export async function getAvatarQualityForProfile(
  creatorProfileId: string,
  client: DbOrTransaction = db
): Promise<AvatarQuality> {
  try {
    const [latestAvatar] = await client
      .select({
        width: profilePhotos.width,
        height: profilePhotos.height,
      })
      .from(profilePhotos)
      .where(
        and(
          eq(profilePhotos.creatorProfileId, creatorProfileId),
          eq(profilePhotos.photoType, 'avatar'),
          eq(profilePhotos.status, 'ready')
        )
      )
      .orderBy(desc(profilePhotos.createdAt))
      .limit(1);

    if (!latestAvatar) {
      return UNKNOWN_AVATAR_QUALITY;
    }

    return resolveAvatarQuality(
      latestAvatar.width ?? null,
      latestAvatar.height ?? null
    );
  } catch (error: unknown) {
    if (isAvatarQualitySchemaUnavailableError(error)) {
      await captureWarning(
        '[avatar-quality] profile_photos metadata unavailable, returning unknown',
        error,
        { creatorProfileId }
      );
      return UNKNOWN_AVATAR_QUALITY;
    }

    throw error;
  }
}
