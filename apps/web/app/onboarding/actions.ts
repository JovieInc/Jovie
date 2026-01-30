'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, profilePhotos, users } from '@/lib/db/schema';
import { publicEnv } from '@/lib/env-public';
import { isSecureEnv } from '@/lib/env-server';
import {
  createOnboardingError,
  mapDatabaseError,
  OnboardingErrorCode,
  onboardingErrorToError,
  unwrapDatabaseError,
} from '@/lib/errors/onboarding';
import { applyProfileEnrichment } from '@/lib/ingestion/profile';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { syncCanonicalUsernameFromApp } from '@/lib/username/sync';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

function getRequestBaseUrl(headersList: Headers): string {
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return publicEnv.NEXT_PUBLIC_APP_URL;
}

/**
 * Fetches the remote avatar image and validates content type.
 */
async function fetchAvatarImage(imageUrl: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
}> {
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

  const upload = await fetch(`${baseUrl}/api/images/upload`, {
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
}): Promise<{
  blobUrl: string;
  photoId: string;
  retriesUsed: number;
} | null> {
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

function profileIsPublishable(
  profile: typeof creatorProfiles.$inferSelect | null
) {
  if (!profile) return false;
  const hasHandle =
    Boolean(profile.username) && Boolean(profile.usernameNormalized);
  const hasName = Boolean(profile.displayName?.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}

/**
 * Handles avatar upload in the background after onboarding completes.
 * Fetches the OAuth avatar and applies it to the profile.
 */
async function handleBackgroundAvatarUpload(
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

/**
 * Runs post-onboarding sync operations in the background.
 * Syncs username and Clerk metadata without blocking.
 */
function runBackgroundSyncOperations(userId: string, username: string): void {
  void Promise.allSettled([
    syncCanonicalUsernameFromApp(userId, username),
    syncAllClerkMetadata(userId),
  ]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const context =
          index === 0 ? 'onboarding_username_sync' : 'onboarding_metadata_sync';
        console.error(`[ONBOARDING] ${context} failed:`, result.reason);
        Sentry.captureException(result.reason, {
          tags: { context, username },
          level: 'warning',
        });
      }
    });
  });
}

/**
 * Logs and captures onboarding errors with full context.
 */
function logOnboardingError(
  error: unknown,
  context: { username: string; displayName?: string; email?: string | null }
): Error {
  console.error('🔴 ONBOARDING ERROR:', error);
  console.error(
    '🔴 ERROR STACK:',
    error instanceof Error ? error.stack : 'No stack available'
  );

  const unwrapped = unwrapDatabaseError(error);
  const effectiveCode = unwrapped.code || 'UNKNOWN_DB_ERROR';
  const effectiveConstraint = unwrapped.constraint;

  console.error('🔴 DATABASE ERROR DETAILS:', {
    code: effectiveCode,
    constraint: effectiveConstraint,
    detail: unwrapped.detail,
    message: unwrapped.message,
  });

  console.error('🔴 REQUEST CONTEXT:', {
    username: context.username,
    displayName: context.displayName,
    email: context.email,
    timestamp: new Date().toISOString(),
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  Sentry.captureException(error, {
    tags: {
      context: 'onboarding_submission',
      username: context.username ?? 'unknown',
      db_error_code: effectiveCode,
    },
    extra: {
      displayName: context.displayName,
      email: context.email,
      dbErrorCode: effectiveCode,
      dbConstraint: effectiveConstraint,
      dbDetail: unwrapped.detail,
      rawErrorKeys:
        error && typeof error === 'object' ? Object.keys(error) : [],
    },
    fingerprint: effectiveConstraint
      ? ['onboarding', effectiveCode, effectiveConstraint]
      : ['onboarding', effectiveCode],
  });

  const resolvedError =
    error instanceof Error && /^\[([A-Z_]+)\]/.test(error.message)
      ? error
      : onboardingErrorToError(mapDatabaseError(error));

  console.error('🔴 RESOLVED ERROR TYPE:', resolvedError.message);

  return resolvedError;
}

/**
 * Creates a new user and profile using the stored database function.
 */
async function createUserAndProfile(
  tx: Parameters<Parameters<typeof withDbSessionTx>[0]>[0],
  clerkUserId: string,
  userEmail: string | null,
  normalizedUsername: string,
  trimmedDisplayName: string
): Promise<{ username: string; status: 'created'; profileId: string | null }> {
  const result = await tx.execute(
    drizzleSql<{ profile_id: string }>`
      SELECT create_profile_with_user(
        ${clerkUserId},
        ${userEmail ?? null},
        ${normalizedUsername},
        ${trimmedDisplayName}
      ) AS profile_id
    `
  );

  const profileId = result.rows?.[0]?.profile_id
    ? String(result.rows[0].profile_id)
    : null;

  return {
    username: normalizedUsername,
    status: 'created',
    profileId,
  };
}

/**
 * Updates an existing profile with new onboarding data.
 */
async function updateExistingProfile(
  tx: Parameters<Parameters<typeof withDbSessionTx>[0]>[0],
  profile: typeof creatorProfiles.$inferSelect,
  normalizedUsername: string,
  trimmedDisplayName: string,
  username: string
): Promise<{ username: string; status: 'updated'; profileId: string }> {
  const nextDisplayName = trimmedDisplayName || profile.displayName || username;

  const [updated] = await tx
    .update(creatorProfiles)
    .set({
      username: normalizedUsername,
      usernameNormalized: normalizedUsername,
      displayName: nextDisplayName,
      onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date(),
      isPublic: true,
      isClaimed: true,
      claimedAt: profile.claimedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id))
    .returning();

  return {
    username: updated?.usernameNormalized || normalizedUsername,
    status: 'updated',
    profileId: profile.id,
  };
}

/**
 * Validates that the provided email is not already in use by another user.
 */
async function ensureEmailAvailable(
  tx: Parameters<Parameters<typeof withDbSessionTx>[0]>[0],
  clerkUserId: string,
  userEmail: string
): Promise<void> {
  const [emailOwner] = await tx
    .select({ clerkId: users.clerkId })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1);

  if (emailOwner && emailOwner.clerkId !== clerkUserId) {
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.EMAIL_IN_USE,
        'Email is already in use'
      )
    );
  }
}

/**
 * Validates that the provided handle is not already in use by another profile.
 */
async function ensureHandleAvailable(
  tx: Parameters<Parameters<typeof withDbSessionTx>[0]>[0],
  normalizedUsername: string,
  profileId?: string | null
): Promise<void> {
  const [conflict] = await tx
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
    .limit(1);

  if (conflict && (!profileId || conflict.id !== profileId)) {
    const error = createOnboardingError(
      OnboardingErrorCode.USERNAME_TAKEN,
      'Handle already taken'
    );
    throw onboardingErrorToError(error);
  }
}

export async function completeOnboarding({
  username,
  displayName,
  email,
  redirectToDashboard = true,
}: {
  username: string;
  displayName?: string;
  email?: string | null;
  redirectToDashboard?: boolean;
}) {
  try {
    // Step 1: Authentication check
    const { userId } = await auth();
    if (!userId) {
      const error = createOnboardingError(
        OnboardingErrorCode.NOT_AUTHENTICATED,
        'User not authenticated'
      );
      throw onboardingErrorToError(error);
    }

    // Step 2: Input validation
    const validation = validateUsername(username);
    if (!validation.isValid) {
      const error = createOnboardingError(
        OnboardingErrorCode.INVALID_USERNAME,
        validation.error || 'Invalid username'
      );
      throw onboardingErrorToError(error);
    }

    const trimmedDisplayName = displayName?.trim();

    if (!trimmedDisplayName) {
      throw onboardingErrorToError(
        createOnboardingError(
          OnboardingErrorCode.DISPLAY_NAME_REQUIRED,
          'Display name is required'
        )
      );
    }

    if (trimmedDisplayName.length > 50) {
      const error = createOnboardingError(
        OnboardingErrorCode.DISPLAY_NAME_TOO_LONG,
        'Display name must be 50 characters or less'
      );
      throw onboardingErrorToError(error);
    }

    // Step 3: Rate limiting check
    const headersList = await headers();
    const clientIP = extractClientIP(headersList);
    const cookieHeader = headersList.get('cookie');
    const baseUrl = getRequestBaseUrl(headersList);

    const clerkUser = await currentUser();
    const clerkIdentity = resolveClerkIdentity(clerkUser);
    const oauthAvatarUrl = clerkIdentity.avatarUrl;

    // IMPORTANT: Always check IP-based rate limiting, even for 'unknown' IPs
    // The 'unknown' bucket acts as a shared rate limit to prevent abuse
    // from users behind proxies or with missing/invalid headers
    const shouldCheckIP = true;

    await enforceOnboardingRateLimit({
      userId,
      ip: clientIP,
      checkIP: shouldCheckIP,
    });

    // Step 4-6: Parallel operations for performance optimization
    const normalizedUsername = normalizeUsername(username);

    const userEmail = email ?? clerkIdentity.email ?? null;

    // CRITICAL: Use SERIALIZABLE isolation level to prevent race conditions
    // where two users could claim the same handle simultaneously.
    // This ensures that concurrent transactions will see a consistent view
    // of the data and will fail if there's a conflict.
    const completion = await withDbSessionTx(
      async (tx, clerkUserId: string) => {
        type CompletionResult = {
          username: string;
          status: 'created' | 'updated' | 'complete';
          profileId: string | null;
        };

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        // If the user record does not exist, the stored function will create both user + profile
        if (!existingUser) {
          if (userEmail) {
            await ensureEmailAvailable(tx, clerkUserId, userEmail);
          }
          await ensureHandleAvailable(tx, normalizedUsername, null);
          return await createUserAndProfile(
            tx,
            clerkUserId,
            userEmail,
            normalizedUsername,
            trimmedDisplayName
          );
        }

        const [existingProfile] = await tx
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, existingUser.id))
          .limit(1);

        // If a profile already exists, ensure the handle is either the same or available
        const handleChanged =
          existingProfile?.usernameNormalized !== normalizedUsername;

        if (handleChanged) {
          await ensureHandleAvailable(
            tx,
            normalizedUsername,
            existingProfile?.id
          );
        }

        const needsPublish = !profileIsPublishable(existingProfile);
        // CRITICAL: Also update if isClaimed is not set - this is required by gate.ts
        // which filters profiles by isClaimed=true. Without this, users with
        // "publishable" profiles but isClaimed=false get stuck in an onboarding loop.
        const needsClaim = existingProfile && !existingProfile.isClaimed;

        if (existingProfile && (needsPublish || handleChanged || needsClaim)) {
          return await updateExistingProfile(
            tx,
            existingProfile,
            normalizedUsername,
            trimmedDisplayName,
            username
          );
        }

        if (existingProfile) {
          const completed: CompletionResult = {
            username: existingProfile.usernameNormalized,
            status: 'complete',
            profileId: existingProfile.id,
          };

          return completed;
        }

        // Fallback: user exists but no profile yet
        if (userEmail) {
          await ensureEmailAvailable(tx, clerkUserId, userEmail);
        }
        await ensureHandleAvailable(tx, normalizedUsername, null);
        return await createUserAndProfile(
          tx,
          clerkUserId,
          userEmail,
          normalizedUsername,
          trimmedDisplayName
        );
      },
      { isolationLevel: 'serializable' }
    );

    // Immediately invalidate user state cache so middleware sees fresh state
    // This prevents stale cache from causing redirect loops
    await invalidateProxyUserStateCache(userId);

    // Step 7: Avatar upload (fire-and-forget, background processing)
    const profileId = completion.profileId;
    if (profileId && oauthAvatarUrl) {
      void handleBackgroundAvatarUpload(
        profileId,
        oauthAvatarUrl,
        baseUrl,
        cookieHeader
      );
    }

    // Step 8: Sync operations (parallel, fire-and-forget)
    runBackgroundSyncOperations(userId, completion.username);

    // ENG-002: Set completion cookie to prevent redirect loop race condition
    // The proxy checks this cookie and bypasses needsOnboarding check for 30s
    // This handles the race between transaction commit and proxy's DB read
    // IMPORTANT: Always set this cookie on success, even when redirectToDashboard=false,
    // because the user will navigate to dashboard after seeing the completion step
    const cookieStore = await cookies();
    cookieStore.set('jovie_onboarding_complete', '1', {
      httpOnly: true,
      secure: isSecureEnv(),
      sameSite: 'lax',
      maxAge: 120, // 2 minutes - enough time to view completion step before going to dashboard
      path: '/',
    });

    // Invalidate dashboard data cache to prevent stale data causing redirect loops
    // This ensures the app layout gets fresh data showing onboarding is complete
    revalidatePath('/app', 'layout');

    if (redirectToDashboard) {
      redirect('/app/dashboard');
    }

    return completion;
  } catch (error) {
    throw logOnboardingError(error, { username, displayName, email });
  }
}
