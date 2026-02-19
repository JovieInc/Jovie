/**
 * Avatar upload and processing for onboarding
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';
import type { AvatarFetchResult, AvatarUploadResult } from './types';

/** Known Vercel project prefixes for this workspace. */
const VERCEL_PROJECT_PREFIXES = ['jovie-', 'shouldimake-'] as const;

/** OAuth provider hostnames that serve user avatar images. */
const OAUTH_AVATAR_HOSTNAMES = [
  'lh3.googleusercontent.com', // Google
  'platform-lookaside.fbsbx.com', // Facebook
  'avatars.githubusercontent.com', // GitHub
  'img.clerk.com', // Clerk
  'images.clerk.dev', // Clerk (legacy)
  'gravatar.com', // Gravatar
  'www.gravatar.com', // Gravatar
  'cdn.discordapp.com', // Discord
] as const;

/**
 * Builds the set of allowed hostnames for avatar uploads.
 * Includes:
 * - localhost for development
 * - The hostname from NEXT_PUBLIC_APP_URL (e.g., jov.ie)
 * - The normalized NEXT_PUBLIC_PROFILE_HOSTNAME
 * - Known OAuth provider hostnames (Google, GitHub, Clerk, etc.)
 */
function buildAllowedHostnames(): Set<string> {
  const allowed = new Set<string>(['localhost', ...OAUTH_AVATAR_HOSTNAMES]);

  // Add hostname from NEXT_PUBLIC_APP_URL
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      allowed.add(parsed.hostname);
    } catch {
      // Invalid URL, skip
    }
  }

  // Add NEXT_PUBLIC_PROFILE_HOSTNAME — normalize in case it includes protocol/port
  const profileHostname = publicEnv.NEXT_PUBLIC_PROFILE_HOSTNAME;
  if (profileHostname) {
    try {
      const parsed = new URL(`https://${profileHostname}`);
      allowed.add(parsed.hostname);
    } catch {
      // Already a bare hostname — use as-is
      allowed.add(profileHostname);
    }
  }

  return allowed;
}

/**
 * Validates and normalizes the remote avatar image URL to prevent SSRF.
 * Only allows HTTP(S) URLs whose hostnames are in the allowed set.
 */
function getSafeImageUrl(imageUrl: string): string {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new TypeError('Invalid avatar image URL');
  }

  // Only allow HTTP(S) schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Invalid avatar image URL protocol');
  }

  const allowedHostnames = buildAllowedHostnames();
  if (!allowedHostnames.has(url.hostname)) {
    throw new TypeError('Avatar image host is not allowed');
  }

  return url.toString();
}

/**
 * Checks if a hostname is a known Vercel preview deployment for this project.
 * Only matches our specific project prefixes, not arbitrary .vercel.app domains.
 */
function isVercelPreviewHostname(hostname: string): boolean {
  if (!hostname.endsWith('.vercel.app')) return false;
  return VERCEL_PROJECT_PREFIXES.some(prefix => hostname.startsWith(prefix));
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
