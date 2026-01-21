'use server';

import { createHash } from 'node:crypto';
import { auth, currentUser } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, profilePhotos, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { publicEnv } from '@/lib/env-public';
import {
  createOnboardingError,
  mapDatabaseError,
  OnboardingErrorCode,
  onboardingErrorToError,
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

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/** Result of fetching avatar from source URL */
interface AvatarFetchResult {
  ok: true;
  buffer: ArrayBuffer;
  contentType: string;
}

/** Errors that should not be retried */
interface NonRetryableError {
  ok: false;
  shouldRetry: false;
  error: Error;
}

/** Errors that can be retried */
interface RetryableError {
  ok: false;
  shouldRetry: true;
  error: Error;
}

type AvatarFetchError = NonRetryableError | RetryableError;

/**
 * Fetch avatar image from source URL
 */
async function fetchAvatarImage(
  imageUrl: string
): Promise<AvatarFetchResult | AvatarFetchError> {
  const source = await fetch(imageUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!source.ok) {
    return {
      ok: false,
      shouldRetry: true,
      error: new Error(`Failed to fetch avatar: ${source.status}`),
    };
  }

  const contentType =
    source.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? null;

  if (!contentType?.startsWith('image/')) {
    return {
      ok: false,
      shouldRetry: false,
      error: new Error(`Invalid content type: ${contentType}`),
    };
  }

  const buffer = await source.arrayBuffer();
  return { ok: true, buffer, contentType };
}

/**
 * Upload avatar buffer to API endpoint
 */
async function uploadAvatarToApi(params: {
  buffer: ArrayBuffer;
  contentType: string;
  baseUrl: string;
  cookieHeader: string | null;
}): Promise<{ blobUrl: string; photoId: string } | RetryableError> {
  const file = new File([params.buffer], 'oauth-avatar', {
    type: params.contentType,
  });

  const formData = new FormData();
  formData.append('file', file);

  const upload = await fetch(`${params.baseUrl}/api/images/upload`, {
    method: 'POST',
    body: formData,
    headers: params.cookieHeader ? { cookie: params.cookieHeader } : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!upload.ok) {
    const errorBody = await upload.text().catch(() => 'Unknown error');
    return {
      ok: false,
      shouldRetry: true,
      error: new Error(`Upload failed: ${upload.status} - ${errorBody}`),
    };
  }

  const data = (await upload.json()) as {
    blobUrl?: string;
    photoId?: string;
    jobId?: string;
  };

  const blobUrl = data.blobUrl ?? null;
  const photoId = data.photoId ?? data.jobId ?? null;

  if (!blobUrl || !photoId) {
    return {
      ok: false,
      shouldRetry: true,
      error: new Error('Upload response missing required fields'),
    };
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
      if (attempt > 0) {
        const delay = Math.min(1000 * attempt, 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const fetchResult = await fetchAvatarImage(params.imageUrl);

      if (!fetchResult.ok) {
        lastError = fetchResult.error;
        console.warn(
          `[AVATAR_UPLOAD] Fetch issue (attempt ${attempt + 1}/${maxRetries}):`,
          lastError.message
        );
        if (!fetchResult.shouldRetry) break;
        continue;
      }

      const uploadResult = await uploadAvatarToApi({
        buffer: fetchResult.buffer,
        contentType: fetchResult.contentType,
        baseUrl: params.baseUrl,
        cookieHeader: params.cookieHeader,
      });

      if (!('blobUrl' in uploadResult)) {
        lastError = uploadResult.error;
        console.warn(
          `[AVATAR_UPLOAD] Upload failed (attempt ${attempt + 1}/${maxRetries}):`,
          lastError.message
        );
        continue;
      }

      console.info(
        `[AVATAR_UPLOAD] Succeeded (${attempt + 1} attempt${attempt === 0 ? '' : 's'})`
      );
      return { ...uploadResult, retriesUsed: attempt };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Unknown upload error');
      console.warn(
        `[AVATAR_UPLOAD] Exception (attempt ${attempt + 1}/${maxRetries}):`,
        lastError.message
      );
    }
  }

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

/** Validated onboarding input */
interface ValidatedOnboardingInput {
  userId: string;
  trimmedDisplayName: string;
  normalizedUsername: string;
  userEmail: string | null;
  oauthAvatarUrl: string | null;
  cookieHeader: string | null;
  baseUrl: string;
}

/**
 * Validate authentication and all onboarding inputs
 */
async function validateOnboardingInput(params: {
  username: string;
  displayName?: string;
  email?: string | null;
}): Promise<ValidatedOnboardingInput> {
  const { userId } = await auth();
  if (!userId) {
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.NOT_AUTHENTICATED,
        'User not authenticated'
      )
    );
  }

  const validation = validateUsername(params.username);
  if (!validation.isValid) {
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.INVALID_USERNAME,
        validation.error || 'Invalid username'
      )
    );
  }

  const trimmedDisplayName = params.displayName?.trim();
  if (!trimmedDisplayName) {
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.DISPLAY_NAME_REQUIRED,
        'Display name is required'
      )
    );
  }

  if (trimmedDisplayName.length > 50) {
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.DISPLAY_NAME_TOO_LONG,
        'Display name must be 50 characters or less'
      )
    );
  }

  const headersList = await headers();
  const clientIP = extractClientIP(headersList);
  const cookieHeader = headersList.get('cookie');
  const baseUrl = getRequestBaseUrl(headersList);

  const clerkUser = await currentUser();
  const clerkIdentity = resolveClerkIdentity(clerkUser);

  await enforceOnboardingRateLimit({
    userId,
    ip: clientIP,
    checkIP: true,
  });

  return {
    userId,
    trimmedDisplayName,
    normalizedUsername: normalizeUsername(params.username),
    userEmail: params.email ?? clerkIdentity.email ?? null,
    oauthAvatarUrl: clerkIdentity.avatarUrl,
    cookieHeader,
    baseUrl,
  };
}

/**
 * Handle avatar upload after profile creation
 */
async function handleAvatarUploadAfterOnboarding(params: {
  profileId: string;
  oauthAvatarUrl: string;
  baseUrl: string;
  cookieHeader: string | null;
}): Promise<void> {
  try {
    const uploaded = await uploadRemoteAvatar({
      imageUrl: params.oauthAvatarUrl,
      baseUrl: params.baseUrl,
      cookieHeader: params.cookieHeader,
      maxRetries: 3,
    });

    if (!uploaded) {
      console.warn(
        '[ONBOARDING] Avatar upload failed for profile:',
        params.profileId
      );
      return;
    }

    await withDbSessionTx(async tx => {
      const [profile] = await tx
        .select({
          avatarUrl: creatorProfiles.avatarUrl,
          avatarLockedByUser: creatorProfiles.avatarLockedByUser,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, params.profileId))
        .limit(1);

      await applyProfileEnrichment(tx, {
        profileId: params.profileId,
        avatarLockedByUser: profile?.avatarLockedByUser ?? null,
        currentAvatarUrl: profile?.avatarUrl ?? null,
        extractedAvatarUrl: uploaded.blobUrl,
      });

      await tx
        .update(profilePhotos)
        .set({
          creatorProfileId: params.profileId,
          sourcePlatform: 'clerk',
          updatedAt: new Date(),
        })
        .where(eq(profilePhotos.id, uploaded.photoId));
    });
  } catch (avatarError) {
    console.error(
      '[ONBOARDING] Avatar upload exception for profile:',
      params.profileId,
      avatarError
    );
  }
}

/**
 * Finalize onboarding completion (sync, cookie, revalidation)
 */
async function finalizeOnboardingCompletion(
  userId: string,
  completedUsername: string
): Promise<void> {
  await syncCanonicalUsernameFromApp(userId, completedUsername);

  try {
    await syncAllClerkMetadata(userId);
  } catch (syncError) {
    console.error('[ONBOARDING] Failed to sync Clerk metadata:', syncError);
  }

  const cookieStore = await cookies();
  cookieStore.set('jovie_onboarding_complete', '1', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 120,
    path: '/',
  });

  revalidatePath('/app', 'layout');
}

/**
 * Log and capture onboarding error with full context
 */
function logAndCaptureOnboardingError(
  error: unknown,
  context: { username: string; displayName?: string; email?: string | null }
): Error {
  console.error('🔴 ONBOARDING ERROR:', error);
  console.error(
    '🔴 ERROR STACK:',
    error instanceof Error ? error.stack : 'No stack available'
  );

  interface DatabaseErrorShape {
    code?: string;
    constraint?: string;
    detail?: string;
    hint?: string;
    table?: string;
    column?: string;
    cause?: unknown;
  }
  const dbError = error as DatabaseErrorShape;
  console.error('🔴 DATABASE ERROR DETAILS:', {
    code: dbError?.code,
    constraint: dbError?.constraint,
    detail: dbError?.detail,
    hint: dbError?.hint,
    table: dbError?.table,
    column: dbError?.column,
    cause: dbError?.cause,
  });

  console.error('🔴 REQUEST CONTEXT:', {
    ...context,
    timestamp: new Date().toISOString(),
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  // Avoid sending raw PII (username/email) to Sentry.
  const usernameHash = context.username
    ? hashIdentifier(context.username)
    : 'unknown';
  const hasEmail = Boolean(context.email);
  const emailHash = context.email
    ? hashIdentifier(context.email.toLowerCase())
    : null;

  Sentry.captureException(error, {
    tags: {
      context: 'onboarding_submission',
      usernameHash,
      hasEmail: hasEmail ? 'true' : 'false',
    },
    extra: {
      emailHash,
      displayNamePresent: Boolean(context.displayName),
      dbErrorCode: dbError?.code,
      dbConstraint: dbError?.constraint,
      dbDetail: dbError?.detail,
    },
  });

  const resolvedError =
    error instanceof Error && /^\[([A-Z_]+)\]/.test(error.message)
      ? error
      : onboardingErrorToError(mapDatabaseError(error));

  console.error('🔴 RESOLVED ERROR TYPE:', resolvedError.message);

  return resolvedError;
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
    const input = await validateOnboardingInput({
      username,
      displayName,
      email,
    });

    // Use validated input values
    const { normalizedUsername, trimmedDisplayName, userEmail } = input;

    // CRITICAL: Use SERIALIZABLE isolation level to prevent race conditions
    const completion = await withDbSessionTx(
      async (tx, clerkUserId: string) => {
        type CompletionResult = {
          username: string;
          status: 'created' | 'updated' | 'complete';
          profileId: string | null;
        };

        const ensureEmailAvailable = async () => {
          if (!userEmail) return;

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
        };

        const ensureHandleAvailable = async (profileId?: string | null) => {
          const [conflict] = await tx
            .select({ id: creatorProfiles.id })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.usernameNormalized, normalizedUsername))
            .limit(1);

          if (conflict && (!profileId || conflict.id !== profileId)) {
            throw onboardingErrorToError(
              createOnboardingError(
                OnboardingErrorCode.USERNAME_TAKEN,
                'Handle already taken'
              )
            );
          }
        };

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        if (!existingUser) {
          await ensureEmailAvailable();
          await ensureHandleAvailable(null);
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
          } as CompletionResult;
        }

        const [existingProfile] = await tx
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, existingUser.id))
          .limit(1);

        const handleChanged =
          existingProfile?.usernameNormalized !== normalizedUsername;
        if (handleChanged) {
          await ensureHandleAvailable(existingProfile?.id);
        }

        const needsPublish = !profileIsPublishable(existingProfile);
        const needsClaim = existingProfile && !existingProfile.isClaimed;

        if (existingProfile && (needsPublish || handleChanged || needsClaim)) {
          const nextDisplayName =
            trimmedDisplayName || existingProfile.displayName || username;

          const [updated] = await tx
            .update(creatorProfiles)
            .set({
              username: normalizedUsername,
              usernameNormalized: normalizedUsername,
              displayName: nextDisplayName,
              onboardingCompletedAt:
                existingProfile.onboardingCompletedAt ?? new Date(),
              isPublic: true,
              isClaimed: true,
              claimedAt: existingProfile.claimedAt ?? new Date(),
              updatedAt: new Date(),
            })
            .where(eq(creatorProfiles.id, existingProfile.id))
            .returning();

          return {
            username: updated?.usernameNormalized || normalizedUsername,
            status: 'updated',
            profileId: existingProfile.id,
          } as CompletionResult;
        }

        if (existingProfile) {
          return {
            username: existingProfile.usernameNormalized,
            status: 'complete',
            profileId: existingProfile.id,
          } as CompletionResult;
        }

        // Fallback: user exists but no profile yet
        await ensureEmailAvailable();
        await ensureHandleAvailable(null);
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
        } as CompletionResult;
      },
      { isolationLevel: 'serializable' }
    );

    // Avatar upload (non-blocking)
    if (completion.profileId && input.oauthAvatarUrl) {
      await handleAvatarUploadAfterOnboarding({
        profileId: completion.profileId,
        oauthAvatarUrl: input.oauthAvatarUrl,
        baseUrl: input.baseUrl,
        cookieHeader: input.cookieHeader,
      });
    }

    await finalizeOnboardingCompletion(input.userId, completion.username);

    if (redirectToDashboard) {
      redirect('/app/dashboard');
    }

    return completion;
  } catch (error) {
    throw logAndCaptureOnboardingError(error, { username, displayName, email });
  }
}
