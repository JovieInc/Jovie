/**
 * Avatar upload and processing for onboarding
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';
import type { AvatarFetchResult, AvatarUploadResult } from './types';

/**
 * Builds the set of allowed hostnames for avatar uploads.
 * Includes:
 * - localhost for development
 * - The hostname from NEXT_PUBLIC_APP_URL (e.g., jov.ie)
 * - Any configured NEXT_PUBLIC_PROFILE_HOSTNAME
 */
function buildAllowedHostnames(): Set<string> {
  const allowed = new Set<string>(['localhost']);

  // Add hostname from NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      allowed.add(parsed.hostname);
    } catch {
      // Invalid URL, skip
    }
  }

  // Add NEXT_PUBLIC_PROFILE_HOSTNAME if set
  const profileHostname = process.env.NEXT_PUBLIC_PROFILE_HOSTNAME;
  if (profileHostname) {
    allowed.add(profileHostname);
  }

  return allowed;
}

/**
 * Checks if a hostname is a Vercel preview deployment.
 * Matches patterns like: project-git-branch-team.vercel.app
 */
function isVercelPreviewHostname(hostname: string): boolean {
  return hostname.endsWith('.vercel.app');
}

/**
 * Returns a safe upload URL for the internal images API, based on a trusted origin.
 * Throws if the provided baseUrl is not in the allow-list of permitted hosts.
 */
function getSafeUploadUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError('Invalid base URL for avatar upload');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('Unsupported protocol for avatar upload URL');
  }

  const allowedHostnames = buildAllowedHostnames();
  const isAllowed =
    allowedHostnames.has(parsed.hostname) ||
    isVercelPreviewHostname(parsed.hostname);

  if (!isAllowed) {
    throw new TypeError('Untrusted host for avatar upload URL');
  }

  const uploadUrl = new URL('/api/images/upload', parsed.origin);
  return uploadUrl.toString();
}

/**
 * Fetches the remote avatar image and validates content type.
 */
async function fetchAvatarImage(imageUrl: string): Promise<AvatarFetchResult> {
  const source = await fetch(imageUrl, {
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
  baseUrl: string,
  buffer: ArrayBuffer,
  contentType: string,
  cookieHeader: string | null
): Promise<{ blobUrl: string; photoId: string }> {
  const file = new File([buffer], 'oauth-avatar', { type: contentType });
  const formData = new FormData();
  formData.append('file', file);

  const uploadUrl = getSafeUploadUrl(baseUrl);
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
  baseUrl: string;
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
        params.baseUrl,
        buffer,
        contentType,
        params.cookieHeader
      );

      // Success - always log for monitoring
      console.info(
        `[AVATAR_UPLOAD] Succeeded (${attempt + 1} attempt${attempt === 0 ? '' : 's'})`
      );
      return { blobUrl, photoId, retriesUsed: attempt };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Unknown upload error');

      const errorMessage = lastError.message;

      // Don't retry for invalid content type - it won't change
      if (errorMessage.includes('Invalid content type')) {
        console.warn('[AVATAR_UPLOAD] Invalid content type:', errorMessage);
        break;
      }

      console.warn(
        `[AVATAR_UPLOAD] Attempt ${attempt + 1}/${maxRetries} failed:`,
        errorMessage
      );
    }
  }

  // All retries exhausted
  console.error(
    `[AVATAR_UPLOAD] Failed after ${maxRetries} attempts:`,
    lastError?.message
  );
  return null;
}

/**
 * Handles avatar upload in the background after onboarding completes.
 * Fetches the OAuth avatar and applies it to the profile.
 */
export async function handleBackgroundAvatarUpload(
  profileId: string,
  oauthAvatarUrl: string,
  baseUrl: string,
  cookieHeader: string | null
): Promise<void> {
  try {
    const uploaded = await uploadRemoteAvatar({
      imageUrl: oauthAvatarUrl,
      baseUrl,
      cookieHeader,
      maxRetries: 3,
    });

    if (!uploaded) {
      console.warn('[ONBOARDING] Avatar upload failed for profile:', profileId);
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
    console.error(
      '[ONBOARDING] Avatar upload exception for profile:',
      profileId,
      avatarError
    );
    Sentry.captureException(avatarError, {
      tags: { context: 'onboarding_avatar_upload', profileId },
      level: 'warning',
    });
  }
}
