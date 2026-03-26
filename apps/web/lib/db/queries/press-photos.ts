import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profilePhotos } from '@/lib/db/schema/profiles';
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

  return db
    .select(pressPhotoSelect)
    .from(profilePhotos)
    .where(and(...filters))
    .orderBy(asc(profilePhotos.sortOrder), asc(profilePhotos.createdAt));
}

export async function getPressPhotosByProfileId(
  profileId: string
): Promise<PressPhoto[]> {
  return db
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
}
