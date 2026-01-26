/**
 * Avatar Processing Module
 *
 * Handles extracting, downloading, optimizing, and storing avatar images
 * from various platform URLs during profile ingestion.
 */

import 'server-only';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DbType } from '@/lib/db';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema';
import { buildSeoFilename } from '@/lib/images/config';
import { logger } from '@/lib/utils/logger';
import { normalizeString } from '@/lib/utils/string-utils';
import { uploadBufferToBlob } from './blob-uploader';
import { extractAvatarCandidateFromLinkUrl } from './candidate-extractor';
import { AVIF_MIME_TYPE, PROCESSING_TIMEOUT_MS } from './constants';
import { downloadImage, sanitizeHttpsUrl } from './http-client';
import { optimizeToAvatarAvif, withTimeout } from './image-optimizer';

/**
 * Process a single link to extract and upload an avatar.
 * Returns the blob URL on success, throws on failure.
 */
async function processAvatarLink(
  linkUrl: string,
  safeHandle: string
): Promise<string> {
  const candidate = await extractAvatarCandidateFromLinkUrl(linkUrl);
  if (!candidate) {
    throw new Error('No avatar candidate found');
  }

  const downloaded = await downloadImage(candidate.avatarUrl);
  const optimized = await withTimeout(
    optimizeToAvatarAvif(downloaded.buffer),
    PROCESSING_TIMEOUT_MS
  );

  const seoFileName = buildSeoFilename({
    originalFilename: downloaded.filename,
    photoId: randomUUID(),
    userLabel: safeHandle,
  });

  const blobPath = `avatars/ingestion/${safeHandle}/${seoFileName}.avif`;
  const blobUrl = await withTimeout(
    uploadBufferToBlob({
      path: blobPath,
      buffer: optimized.data,
      contentType: AVIF_MIME_TYPE,
    }),
    PROCESSING_TIMEOUT_MS
  );

  return blobUrl;
}

/**
 * Copy an avatar from discovered links during ingestion.
 *
 * Processes links in parallel and returns the first successful avatar URL.
 * Uses Promise.any() to race candidates for faster extraction.
 */
export async function maybeCopyIngestionAvatarFromLinks(params: {
  handle: string;
  links: string[];
}): Promise<string | null> {
  const { handle, links } = params;
  const safeHandle = normalizeString(handle);
  if (!safeHandle) return null;
  if (links.length === 0) return null;

  try {
    // Race all link processing in parallel - first success wins
    const blobUrl = await Promise.any(
      links.map(linkUrl => processAvatarLink(linkUrl, safeHandle))
    );
    return blobUrl;
  } catch {
    // All promises rejected (AggregateError) - no valid avatar found
    return null;
  }
}

/**
 * Extract and download avatar candidate from a link URL.
 * Returns candidate info and downloaded image on success, throws on failure.
 */
async function extractAndDownloadCandidate(linkUrl: string): Promise<{
  candidate: { avatarUrl: string; sourcePlatform: string };
  downloaded: { buffer: Buffer; contentType: string; filename: string };
}> {
  const candidate = await extractAvatarCandidateFromLinkUrl(linkUrl);
  if (!candidate) {
    throw new Error('No avatar candidate found');
  }

  const downloaded = await downloadImage(candidate.avatarUrl);
  return { candidate, downloaded };
}

/**
 * Set a profile avatar from discovered links.
 *
 * Extracts and downloads candidates in parallel for faster processing,
 * then creates the profile photo record for the first successful candidate.
 */
export async function maybeSetProfileAvatarFromLinks(params: {
  db: DbType;
  clerkUserId: string;
  profileId: string;
  userId: string | null;
  currentAvatarUrl: string | null;
  avatarLockedByUser: boolean | null;
  links: string[];
  sourceType?: 'manual' | 'admin' | 'ingested';
  ingestionOwnerUserId?: string | null;
  confidence?: string;
}): Promise<string | null> {
  const {
    db,
    clerkUserId,
    profileId,
    userId,
    currentAvatarUrl,
    avatarLockedByUser,
    links,
    sourceType = 'manual',
    ingestionOwnerUserId = null,
    confidence = '0.80',
  } = params;

  if (!userId) return null;
  if (avatarLockedByUser) return null;
  if (currentAvatarUrl) return null;

  // Phase 1: Race extraction and download in parallel - first success wins
  let extractedCandidate: Awaited<
    ReturnType<typeof extractAndDownloadCandidate>
  >;
  try {
    extractedCandidate = await Promise.any(
      links.map(linkUrl => extractAndDownloadCandidate(linkUrl))
    );
  } catch {
    // All promises rejected - no valid avatar found
    return null;
  }

  // Phase 2: Process the winning candidate (DB operations are sequential)
  const { candidate, downloaded } = extractedCandidate;

  try {
    const [photoRecord] = await db
      .insert(profilePhotos)
      .values({
        userId,
        creatorProfileId: profileId,
        ingestionOwnerUserId,
        status: 'processing',
        sourcePlatform: candidate.sourcePlatform,
        sourceType,
        confidence,
        lockedByUser: false,
        originalFilename: downloaded.filename,
        mimeType: downloaded.contentType,
        fileSize: downloaded.buffer.length,
      })
      .returning({ id: profilePhotos.id });

    if (!photoRecord?.id) return null;

    const optimized = await withTimeout(
      optimizeToAvatarAvif(downloaded.buffer),
      PROCESSING_TIMEOUT_MS
    );

    const seoFileName = buildSeoFilename({
      originalFilename: downloaded.filename,
      photoId: photoRecord.id,
    });
    const blobPath = `avatars/users/${clerkUserId}/${seoFileName}.avif`;

    const blobUrl = await withTimeout(
      uploadBufferToBlob({
        path: blobPath,
        buffer: optimized.data,
        contentType: AVIF_MIME_TYPE,
      }),
      PROCESSING_TIMEOUT_MS
    );

    await db
      .update(profilePhotos)
      .set({
        blobUrl,
        smallUrl: blobUrl,
        mediumUrl: blobUrl,
        largeUrl: blobUrl,
        status: 'ready',
        mimeType: AVIF_MIME_TYPE,
        fileSize: optimized.info.size ?? optimized.data.length,
        width: optimized.width,
        height: optimized.height,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profilePhotos.id, photoRecord.id));

    await db
      .update(creatorProfiles)
      .set({ avatarUrl: blobUrl, updatedAt: new Date() })
      .where(eq(creatorProfiles.id, profileId));

    return blobUrl;
  } catch {
    return null;
  }
}

/**
 * Copy an external avatar URL directly to Jovie's blob storage.
 *
 * This is useful during ingestion when we already have an extracted avatar URL
 * and want to re-host it on Jovie's storage instead of storing the external URL.
 *
 * @param params.externalUrl - The external HTTPS URL to copy
 * @param params.handle - The profile handle (used for storage path)
 * @param params.sourcePlatform - The source platform for logging/tracking
 * @returns The Jovie blob URL or null if copying failed
 */
export async function copyExternalAvatarToStorage(params: {
  externalUrl: string;
  handle: string;
  sourcePlatform?: string;
}): Promise<string | null> {
  const { externalUrl, handle, sourcePlatform = 'ingestion' } = params;

  const sanitized = sanitizeHttpsUrl(externalUrl);
  if (!sanitized) return null;

  const safeHandle = normalizeString(handle);
  if (!safeHandle) return null;

  try {
    const downloaded = await downloadImage(sanitized);

    const optimized = await withTimeout(
      optimizeToAvatarAvif(downloaded.buffer),
      PROCESSING_TIMEOUT_MS
    );

    const seoFileName = buildSeoFilename({
      originalFilename: downloaded.filename,
      photoId: randomUUID(),
      userLabel: safeHandle,
    });

    const blobPath = `avatars/ingestion/${safeHandle}/${seoFileName}.avif`;

    const blobUrl = await withTimeout(
      uploadBufferToBlob({
        path: blobPath,
        buffer: optimized.data,
        contentType: AVIF_MIME_TYPE,
      }),
      PROCESSING_TIMEOUT_MS
    );

    return blobUrl;
  } catch (error) {
    // Log but don't throw - avatar copying is best-effort
    logger.warn('copyExternalAvatarToStorage failed', {
      sourcePlatform,
      error,
    });
    return null;
  }
}

// Re-export types for consumers
export type {
  AvatarCandidate,
  DownloadedImage,
  OptimizedAvatar,
} from './types';
