/**
 * Avatar upload and processing for onboarding
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';
import { getSafeImageUrl, getSafeUploadUrl } from './avatar-url-utils';
import type { AvatarFetchResult, AvatarUploadResult } from './types';

/**
 * Fetches the remote avatar image and validates content type.
 */
async function fetchAvatarImage(imageUrl: string): Promise<AvatarFetchResult> {
  const safeImageUrl = getSafeImageUrl(imageUrl);
  const source = await fetch(safeImageUrl, {
    redirect: 'error', // Prevent SSRF via redirect to internal services
    signal: AbortSignal.timeout(10000), // 10s timeout for fetching image
  });

  if (!source.ok) {
    throw new Error(`Failed to fetch avatar: ${source.status}`);
  }

  const contentType =
    source.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? null;

  if (!contentType?.startsWith('image/')) {
    throw new TypeError(`Invalid content type: ${contentType}`);
  }

  if (source.bodyUsed) {
    throw new Error('Response body has already been consumed');
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await source.arrayBuffer();
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message.includes('detached ArrayBuffer')
    ) {
      throw new Error('Response body was detached before reading');
    }
    throw error;
  }

  return { buffer, contentType };
}

/**
 * Uploads avatar file to the API endpoint.
 */
async function uploadAvatarFile(
  buffer: ArrayBuffer,
  contentType: string,
  cookieHeader: string | null
): Promise<{ blobUrl: string; photoId: string }> {
  const file = new File([buffer], 'oauth-avatar', { type: contentType });
  const formData = new FormData();
  formData.append('file', file);

  const uploadUrl = getSafeUploadUrl();
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    signal: AbortSignal.timeout(30000), // 30s timeout for upload
  });

  if (!upload.ok) {
    const errorBody = await upload.text().catch(() => 'Unknown error');
    throw new Error(`Upload failed: ${upload.status} - ${errorBody}`);
  }

  const data = (await upload.json()) as {
    blobUrl?: string;
    photoId?: string;
    jobId?: string;
  };

  const blobUrl = data.blobUrl ?? null;
  const photoId = data.photoId ?? data.jobId ?? null;

  if (!blobUrl || !photoId) {
    throw new TypeError('Upload response missing required fields');
  }

  return { blobUrl, photoId };
}

/**
 * Upload a remote avatar with retry mechanism.
 *
 * Implements exponential backoff retry for reliability.
 * Logs failures for monitoring and debugging.
 *
 * @returns Upload result or null if all retries fail
 */
async function uploadRemoteAvatar(params: {
  imageUrl: string;
  cookieHeader: string | null;
  maxRetries?: number;
}): Promise<AvatarUploadResult | null> {
  const maxRetries = params.maxRetries ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Exponential backoff: 0ms, 1000ms, 2000ms
      if (attempt > 0) {
        const delay = Math.min(1000 * attempt, 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const { buffer, contentType } = await fetchAvatarImage(params.imageUrl);
      const { blobUrl, photoId } = await uploadAvatarFile(
        buffer,
        contentType,
        params.cookieHeader
      );

      // Success
      return { blobUrl, photoId, retriesUsed: attempt };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Unknown upload error');

      const errorMessage = lastError.message;

      // Don't retry for invalid content type - it won't change
      if (errorMessage.includes('Invalid content type')) {
        Sentry.captureMessage('Avatar upload: invalid content type', {
          level: 'warning',
          extra: { errorMessage },
        });
        break;
      }

      Sentry.captureMessage(
        `Avatar upload attempt ${attempt + 1}/${maxRetries} failed`,
        {
          level: 'warning',
          extra: { errorMessage },
        }
      );
    }
  }

  // All retries exhausted
  if (lastError) {
    Sentry.captureException(lastError, {
      extra: { maxRetries, context: 'avatar_upload_retries_exhausted' },
    });
  }
  return null;
}

/**
 * Handles avatar upload in the background after onboarding completes.
 * Fetches the OAuth avatar and applies it to the profile.
 */
export async function handleBackgroundAvatarUpload(
  profileId: string,
  oauthAvatarUrl: string,
  cookieHeader: string | null
): Promise<void> {
  try {
    const uploaded = await uploadRemoteAvatar({
      imageUrl: oauthAvatarUrl,
      cookieHeader,
      maxRetries: 3,
    });

    if (!uploaded) {
      Sentry.captureMessage('Avatar upload failed for profile', {
        level: 'warning',
        extra: { profileId },
      });
      return;
    }

    await withDbSessionTx(async tx => {
      const [profile] = await tx
        .select({
          avatarUrl: creatorProfiles.avatarUrl,
          avatarLockedByUser: creatorProfiles.avatarLockedByUser,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1);

      await applyProfileEnrichment(tx, {
        profileId,
        avatarLockedByUser: profile?.avatarLockedByUser ?? null,
        currentAvatarUrl: profile?.avatarUrl ?? null,
        extractedAvatarUrl: uploaded.blobUrl,
      });

      await tx
        .update(profilePhotos)
        .set({
          creatorProfileId: profileId,
          sourcePlatform: 'clerk',
          updatedAt: new Date(),
        })
        .where(eq(profilePhotos.id, uploaded.photoId));
    });
  } catch (avatarError) {
    Sentry.captureException(avatarError, {
      tags: { context: 'onboarding_avatar_upload', profileId },
      level: 'warning',
    });
  }
}
