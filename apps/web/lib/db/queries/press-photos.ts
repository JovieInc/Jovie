import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profilePhotos } from '@/lib/db/schema/profiles';
import { captureWarning } from '@/lib/error-tracking';
import type { PressPhoto } from '@/types/press-photos';

const pressPhotoSelect = {
  id: profilePhotos.id,
  blobUrl: profilePhotos.blobUrl,
  smallUrl: profilePhotos.smallUrl,
  mediumUrl: profilePhotos.mediumUrl,
  largeUrl: profilePhotos.largeUrl,
  originalFilename: profilePhotos.originalFilename,
  width: profilePhotos.width,
  height: profilePhotos.height,
  status: profilePhotos.status,
  sortOrder: profilePhotos.sortOrder,
} as const;

export function isPressPhotoSchemaUnavailableError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const causeMessage =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : '';

  return (
    errorMessage.includes('does not exist') ||
    causeMessage.includes('does not exist')
  );
}

export async function getPressPhotosByUserId(
  userId: string,
  creatorProfileId?: string
): Promise<PressPhoto[]> {
  const filters = [
    eq(profilePhotos.userId, userId),
    eq(profilePhotos.photoType, 'press'),
  ];

  if (creatorProfileId) {
    filters.push(eq(profilePhotos.creatorProfileId, creatorProfileId));
  }

  try {
    return await db
      .select(pressPhotoSelect)
      .from(profilePhotos)
      .where(and(...filters))
      .orderBy(asc(profilePhotos.sortOrder), asc(profilePhotos.createdAt));
  } catch (error: unknown) {
    if (isPressPhotoSchemaUnavailableError(error)) {
      captureWarning(
        '[press-photos] profile_photos press fields unavailable, returning empty',
        error,
        { userId, creatorProfileId }
      );
      return [];
    }

    throw error;
  }
}

export async function getPressPhotosByProfileId(
  profileId: string
): Promise<PressPhoto[]> {
  try {
    return await db
      .select(pressPhotoSelect)
      .from(profilePhotos)
      .where(
        and(
          eq(profilePhotos.creatorProfileId, profileId),
          eq(profilePhotos.photoType, 'press'),
          eq(profilePhotos.status, 'ready')
        )
      )
      .orderBy(asc(profilePhotos.sortOrder), asc(profilePhotos.createdAt))
      .limit(6);
  } catch (error: unknown) {
    if (isPressPhotoSchemaUnavailableError(error)) {
      captureWarning(
        '[press-photos] profile_photos press fields unavailable, returning empty',
        error,
        { profileId }
      );
      return [];
    }

    throw error;
  }
}
