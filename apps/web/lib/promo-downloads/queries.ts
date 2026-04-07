/**
 * Shared database queries for promo downloads.
 * Eliminates duplication across API routes and pages.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';

/**
 * Fetch a promo download with its creator profile and Pro status.
 * Used by request-otp and verify-otp routes.
 */
export async function getPromoDownloadWithCreator(id: string) {
  const [download] = await db
    .select({
      id: promoDownloads.id,
      creatorProfileId: promoDownloads.creatorProfileId,
      releaseId: promoDownloads.releaseId,
      title: promoDownloads.title,
      artworkUrl: promoDownloads.artworkUrl,
      isActive: promoDownloads.isActive,
      artistName: creatorProfiles.displayName,
      artistHandle: creatorProfiles.username,
      isPro: users.isPro,
    })
    .from(promoDownloads)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, promoDownloads.creatorProfileId)
    )
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(promoDownloads.id, id))
    .limit(1);

  return download ?? null;
}

/**
 * Fetch a creator profile with Pro status by userId.
 * Used by upload-token and confirm routes.
 */
export async function getCreatorProfileForUser(userId: string) {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      isPro: users.isPro,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);

  return profile ?? null;
}

/**
 * Fetch active promo download files for a release, ordered by position.
 */
export async function getActivePromoFiles(releaseId: string) {
  return db
    .select({
      id: promoDownloads.id,
      title: promoDownloads.title,
      fileUrl: promoDownloads.fileUrl,
      fileName: promoDownloads.fileName,
      fileMimeType: promoDownloads.fileMimeType,
      fileSizeBytes: promoDownloads.fileSizeBytes,
    })
    .from(promoDownloads)
    .where(
      and(
        eq(promoDownloads.releaseId, releaseId),
        eq(promoDownloads.isActive, true)
      )
    )
    .orderBy(promoDownloads.position);
}
