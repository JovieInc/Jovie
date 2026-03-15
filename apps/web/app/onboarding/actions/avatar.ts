/**
 * Avatar upload and processing for onboarding
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import { isAllowedAvatarHostname } from '@/lib/images/avatar-hosts';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';
import type { AvatarFetchResult, AvatarUploadResult } from './types';

/** Known Vercel project prefixes for this workspace. */
const VERCEL_PROJECT_PREFIXES = ['jovie-', 'shouldimake-'] as const;

/**
 * Builds the set of allowed hostnames for avatar uploads.
 * Includes:
 * - localhost for development
 * - The hostname from NEXT_PUBLIC_APP_URL (e.g., jov.ie)
 * - The normalized NEXT_PUBLIC_PROFILE_HOSTNAME
 * - Known OAuth provider hostnames (Google, GitHub, Clerk, etc.)
 */
function buildAllowedHostnames(): Set<string> {
  const allowed = new Set<string>(['localhost']);

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
  if (
    !allowedHostnames.has(url.hostname) &&
    !isAllowedAvatarHostname(url.hostname)
  ) {
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
 * Returns a safe upload URL for the internal images API.
 * Uses NEXT_PUBLIC_APP_URL as a trusted origin instead of request headers.
 */
export async function getSafeUploadUrl(): Promise<string> {
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
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
    redirect: 'follow', // OAuth providers (Google, GitHub) commonly redirect avatar URLs
    signal: AbortSignal.timeout(15_000), // 15s timeout — cold starts + OAuth CDNs can be slow
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

  const uploadUrl = await getSafeUploadUrl();
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    signal: AbortSignal.timeout(30000), // 30s timeout for upload
  });

  if (!upload.ok) {
    if (upload.status === 401) {
      throw new Error('Upload failed: 401 UNAUTHORIZED');
    }
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
 * Exponential backoff with jitter for retry delays.
 * Returns a promise that resolves after the computed delay.
 */
function backoffDelay(attempt: number): Promise<void> {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
  const jitter = Math.floor(Math.random() * baseDelay * 0.3); // NOSONAR (S2245) - Non-security use: retry backoff jitter (30%) to prevent thundering herd
  return new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
}

/**
 * Handles a fetch attempt error during avatar retrieval.
 * Returns null to signal "abort and return null", or the Error to continue the loop.
 */
function onFetchError(
  error: unknown,
  attempt: number,
  maxRetries: number
): Error | null {
  const err = error instanceof Error ? error : new Error('Unknown fetch error');

  if (err.name === 'AbortError' || err.message.includes('aborted')) {
    return null;
  }

  if (err.message.includes('Invalid content type')) {
    Sentry.captureMessage('Avatar upload: invalid content type', {
      level: 'warning',
      extra: { errorMessage: err.message },
    });
    return null;
  }

  if (attempt < maxRetries - 1) {
    Sentry.addBreadcrumb({
      category: 'avatar',
      message: `Avatar fetch attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`,
      level: 'info',
    });
  }
  return err;
}

/**
 * Handles an upload attempt error during avatar upload.
 * Returns null to signal "abort and return null", or the Error to continue the loop.
 */
function onUploadError(
  error: unknown,
  attempt: number,
  maxRetries: number
): Error | null {
  const err =
    error instanceof Error ? error : new Error('Unknown upload error');

  if (err.name === 'AbortError' || err.message.includes('aborted')) {
    return null;
  }

  if (err.message.includes('401')) {
    Sentry.addBreadcrumb({
      category: 'avatar',
      message: `Avatar upload auth failed: ${err.message}`,
      level: 'warning',
    });
    return null;
  }

  if (attempt < maxRetries - 1) {
    Sentry.addBreadcrumb({
      category: 'avatar',
      message: `Avatar upload attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`,
      level: 'info',
    });
  }
  return err;
}

/**
 * Fetches a remote avatar image with retry and backoff.
 * Returns null if all attempts fail.
 */
async function fetchAvatarWithRetry(
  imageUrl: string,
  maxRetries: number
): Promise<AvatarFetchResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) await backoffDelay(attempt);
      return await fetchAvatarImage(imageUrl);
    } catch (error) {
      const err = onFetchError(error, attempt, maxRetries);
      if (err === null) return null;
      lastError = err;
    }
  }

  if (lastError) {
    Sentry.captureException(lastError, {
      extra: { maxRetries, context: 'avatar_fetch_retries_exhausted' },
    });
  }
  return null;
}

/**
 * Uploads a fetched avatar image with retry and backoff.
 * Returns null if all attempts fail.
 */
async function uploadAvatarWithRetry(
  fetchResult: AvatarFetchResult,
  cookieHeader: string | null,
  maxRetries: number
): Promise<AvatarUploadResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) await backoffDelay(attempt);
      const { blobUrl, photoId } = await uploadAvatarFile(
        fetchResult.buffer,
        fetchResult.contentType,
        cookieHeader
      );
      return { blobUrl, photoId, retriesUsed: attempt };
    } catch (error) {
      const err = onUploadError(error, attempt, maxRetries);
      if (err === null) return null;
      lastError = err;
    }
  }

  if (lastError) {
    Sentry.captureException(lastError, {
      extra: { maxRetries, context: 'avatar_upload_retries_exhausted' },
    });
  }
  return null;
}

/**
 * Upload a remote avatar with retry mechanism.
 *
 * Separates the fetch and upload steps so that a successful image fetch
 * is not repeated when only the upload fails. Uses exponential backoff
 * with jitter for reliability. Intermediate failures are recorded as
 * breadcrumbs; only final exhaustion is reported as a Sentry event.
 *
 * @returns Upload result or null if all retries fail
 */
export async function uploadRemoteAvatar(params: {
  imageUrl: string;
  cookieHeader: string | null;
  maxRetries?: number;
}): Promise<AvatarUploadResult | null> {
  const maxRetries = params.maxRetries ?? 3;
  const fetchResult = await fetchAvatarWithRetry(params.imageUrl, maxRetries);
  if (!fetchResult) return null;
  return uploadAvatarWithRetry(fetchResult, params.cookieHeader, maxRetries);
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
      // Background avatar upload failures are expected (OAuth CDN issues, expired sessions)
      // — log as breadcrumb instead of Sentry event to reduce noise
      Sentry.addBreadcrumb({
        category: 'avatar',
        message: `Background avatar upload failed for profile ${profileId}`,
        level: 'warning',
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
    // Don't report abort errors to Sentry
    const isAbortError =
      avatarError instanceof Error &&
      (avatarError.name === 'AbortError' ||
        avatarError.message.includes('aborted'));

    if (!isAbortError) {
      Sentry.captureException(avatarError, {
        tags: { context: 'onboarding_avatar_upload', profileId },
        level: 'warning',
      });
    }
  }
}
