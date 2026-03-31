/**
 * Press Photo Ingestion from DSP Sources
 *
 * Downloads artist images from DSP avatar candidates and creates
 * draft press photos. All ingested photos start as 'draft' and
 * require artist approval before appearing on public profiles.
 *
 * Must be called OUTSIDE the enrichment transaction to avoid
 * holding DB connections during network I/O and image processing.
 */

import 'server-only';

import { and, count, desc, eq } from 'drizzle-orm';
import {
  buildBlobPath,
  getVercelBlobUploader,
  uploadBufferToBlob,
} from '@/app/api/images/upload/lib/blob-upload';
import {
  getImageBufferMetadata,
  processPressPhotoBufferToSizes,
} from '@/app/api/images/upload/lib/image-processing';
import { db } from '@/lib/db';
import {
  creatorAvatarCandidates,
  creatorProfiles,
  profilePhotos,
} from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// Constants
// ============================================================================

const MAX_PRESS_PHOTOS = 6;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Allowed CDN hostnames for DSP image downloads (SSRF protection) */
const ALLOWED_IMAGE_HOSTS = new Set([
  'i.scdn.co', // Spotify
  'mosaic.scdn.co', // Spotify mosaics
  'image-cdn-ak.spotifycdn.com', // Spotify CDN
  'image-cdn-fa.spotifycdn.com', // Spotify CDN
  'is1-ssl.mzstatic.com', // Apple Music
  'is2-ssl.mzstatic.com', // Apple Music
  'is3-ssl.mzstatic.com', // Apple Music
  'is4-ssl.mzstatic.com', // Apple Music
  'is5-ssl.mzstatic.com', // Apple Music
  'e-cdns-images.dzcdn.net', // Deezer
  'cdns-images.dzcdn.net', // Deezer
  'api.deezer.com', // Deezer API
]);

/** DSP confidence scores (mirrors profile-enrichment.ts) */
const DSP_PRESS_CONFIDENCE: Record<string, number> = {
  spotify: 0.95,
  apple_music: 0.9,
  deezer: 0.85,
  youtube_music: 0.8,
  tidal: 0.75,
  soundcloud: 0.7,
  amazon_music: 0.7,
  musicbrainz: 0.6,
};

// ============================================================================
// SSRF Protection
// ============================================================================

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// ============================================================================
// Image Download
// ============================================================================

async function downloadImage(url: string): Promise<Buffer | null> {
  if (!isAllowedImageUrl(url)) {
    logger.warn('[press-photo-ingestion] Blocked non-allowlisted URL', {
      url: url.slice(0, 100),
    });
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      IMAGE_DOWNLOAD_TIMEOUT_MS
    );

    let response: Response;

    try {
      const firstResponse = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Jovie/1.0 (press-photo-ingestion)' },
      });

      response = firstResponse;
      if (firstResponse.status >= 300 && firstResponse.status < 400) {
        const redirectUrl = firstResponse.headers.get('location');
        if (!redirectUrl) {
          logger.warn(
            '[press-photo-ingestion] Redirect missing location header',
            {
              url: url.slice(0, 100),
            }
          );
          return null;
        }

        const resolvedRedirectUrl = new URL(redirectUrl, url).toString();
        if (!isAllowedImageUrl(resolvedRedirectUrl)) {
          logger.warn('[press-photo-ingestion] Redirect blocked by allowlist', {
            url: url.slice(0, 100),
            redirectUrl: resolvedRedirectUrl.slice(0, 100),
          });
          return null;
        }

        response = await fetch(resolvedRedirectUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Jovie/1.0 (press-photo-ingestion)' },
        });
      }

      if (!response.ok) {
        logger.warn('[press-photo-ingestion] Download failed', {
          url: url.slice(0, 100),
          status: response.status,
        });
        return null;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        logger.warn('[press-photo-ingestion] Non-image content type', {
          url: url.slice(0, 100),
          contentType,
        });
        return null;
      }

      const contentLength = response.headers.get('content-length');
      if (
        contentLength &&
        Number.parseInt(contentLength, 10) > MAX_IMAGE_BYTES
      ) {
        logger.warn('[press-photo-ingestion] Image too large, skipping', {
          url: url.slice(0, 100),
          contentLength,
        });
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
        logger.warn(
          '[press-photo-ingestion] Image too large after download, skipping',
          {
            url: url.slice(0, 100),
            byteLength: arrayBuffer.byteLength,
          }
        );
        return null;
      }

      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.warn('[press-photo-ingestion] Download error', {
      url: url.slice(0, 100),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================================================
// Core Ingestion
// ============================================================================

export interface PressPhotoIngestionResult {
  creatorProfileId: string;
  photosIngested: number;
  photosSkipped: number;
  errors: string[];
}

/**
 * Ingest DSP images as draft press photos for an artist profile.
 *
 * Reads avatar candidates from the database, downloads the highest-res
 * version of each, processes through the AVIF pipeline, and stores as
 * draft press photos. Skips DSPs that already have a press photo for
 * this profile.
 *
 * MUST be called outside the enrichment transaction.
 */
export async function ingestDspPressPhotos(
  creatorProfileId: string,
  userId: string,
  clerkUserId: string
): Promise<PressPhotoIngestionResult> {
  const result: PressPhotoIngestionResult = {
    creatorProfileId,
    photosIngested: 0,
    photosSkipped: 0,
    errors: [],
  };

  try {
    // Get avatar candidates for this profile
    const candidates = await db
      .select({
        avatarUrl: creatorAvatarCandidates.avatarUrl,
        sourcePlatform: creatorAvatarCandidates.sourcePlatform,
        confidenceScore: creatorAvatarCandidates.confidenceScore,
      })
      .from(creatorAvatarCandidates)
      .where(eq(creatorAvatarCandidates.creatorProfileId, creatorProfileId))
      .orderBy(desc(creatorAvatarCandidates.confidenceScore));

    if (candidates.length === 0) {
      return result;
    }

    type PreparedPressPhoto = {
      platform: string;
      blobUrl: string;
      sizeUrls: Record<string, string>;
      metadata: { width: number | null; height: number | null };
      confidence: number;
      originalBuffer: Buffer;
    };

    const preparedPhotos: PreparedPressPhoto[] = [];

    // Get blob uploader
    const put = await getVercelBlobUploader();

    // Get username for blob path
    const [profile] = await db
      .select({ usernameNormalized: creatorProfiles.usernameNormalized })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, creatorProfileId))
      .limit(1);

    const username = profile?.usernameNormalized ?? 'unknown';

    // Process candidate images and upload to blob outside the transaction
    for (const candidate of candidates) {
      const platform = candidate.sourcePlatform;

      try {
        // Download the image
        const imageBuffer = await downloadImage(candidate.avatarUrl);
        if (!imageBuffer) {
          result.photosSkipped++;
          continue;
        }

        // Process through Sharp AVIF pipeline
        const sizeBuffers = await processPressPhotoBufferToSizes(imageBuffer);
        const originalBuffer = sizeBuffers.original;
        if (!originalBuffer) {
          result.errors.push(`No original buffer for ${platform}`);
          continue;
        }

        // Get metadata for dimensions
        const metadata = await getImageBufferMetadata(originalBuffer);

        // Upload to Vercel Blob
        const seoName = `${username}-press-${platform}-${Date.now()}`;
        const blobPath = buildBlobPath(seoName, clerkUserId, 'press');
        const blobUrl = await uploadBufferToBlob(
          put,
          blobPath,
          originalBuffer,
          'image/avif'
        );

        // Upload size variants
        const sizeUrls: Record<string, string> = {};
        for (const [size, buffer] of Object.entries(sizeBuffers)) {
          if (size === 'original') continue;
          const sizePath = buildBlobPath(
            `${seoName}-${size}`,
            clerkUserId,
            'press'
          );
          sizeUrls[size] = await uploadBufferToBlob(
            put,
            sizePath,
            buffer,
            'image/avif'
          );
        }

        const confidence = DSP_PRESS_CONFIDENCE[platform] ?? 0.5;

        preparedPhotos.push({
          platform,
          blobUrl,
          sizeUrls,
          metadata,
          confidence,
          originalBuffer,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`${platform}: ${errMsg}`);
        logger.warn('[press-photo-ingestion] Failed to ingest photo', {
          creatorProfileId,
          platform,
          error: errMsg,
        });
      }
    }

    if (preparedPhotos.length === 0) {
      return result;
    }

    await db.transaction(async tx => {
      const [lockedProfile] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, creatorProfileId))
        .for('update')
        .limit(1);

      if (!lockedProfile) {
        logger.warn(
          '[press-photo-ingestion] Creator profile disappeared before ingest',
          {
            creatorProfileId,
          }
        );
        return;
      }

      const [photoCount] = await tx
        .select({ count: count() })
        .from(profilePhotos)
        .where(
          and(
            eq(profilePhotos.creatorProfileId, creatorProfileId),
            eq(profilePhotos.photoType, 'press')
          )
        );

      let currentCount = photoCount?.count ?? 0;
      if (currentCount >= MAX_PRESS_PHOTOS) {
        logger.info('[press-photo-ingestion] Profile at photo cap, skipping', {
          creatorProfileId,
          currentCount,
        });
        return;
      }

      // Check which DSPs already have press photos for this profile
      const existingPhotos = await tx
        .select({ sourcePlatform: profilePhotos.sourcePlatform })
        .from(profilePhotos)
        .where(
          and(
            eq(profilePhotos.creatorProfileId, creatorProfileId),
            eq(profilePhotos.photoType, 'press'),
            eq(profilePhotos.sourceType, 'ingested')
          )
        );

      const existingPlatforms = new Set(
        existingPhotos.map(p => p.sourcePlatform).filter(Boolean)
      );

      let sortOrder = currentCount;

      for (const prepared of preparedPhotos) {
        if (currentCount >= MAX_PRESS_PHOTOS) {
          break;
        }

        if (existingPlatforms.has(prepared.platform)) {
          result.photosSkipped++;
          continue;
        }

        await tx.insert(profilePhotos).values({
          userId,
          creatorProfileId,
          photoType: 'press',
          sourceType: 'ingested',
          sourcePlatform: prepared.platform,
          status: 'draft',
          confidence: String(prepared.confidence),
          blobUrl: prepared.blobUrl,
          smallUrl: prepared.sizeUrls['400'] ?? null,
          mediumUrl: prepared.sizeUrls['800'] ?? null,
          largeUrl: prepared.sizeUrls['1200'] ?? null,
          width: prepared.metadata.width,
          height: prepared.metadata.height,
          originalFilename: `${prepared.platform}-artist-photo.avif`,
          mimeType: 'image/avif',
          fileSize: prepared.originalBuffer.length,
          sortOrder,
        });

        existingPlatforms.add(prepared.platform);
        result.photosIngested++;
        currentCount += 1;
        sortOrder += 1;

        logger.info('[press-photo-ingestion] Ingested press photo', {
          creatorProfileId,
          platform: prepared.platform,
          width: prepared.metadata.width,
          height: prepared.metadata.height,
        });
      }
    });

    return result;
  } catch (error) {
    await captureError('Press photo ingestion failed', error, {
      creatorProfileId,
    });
    throw error;
  }
}
