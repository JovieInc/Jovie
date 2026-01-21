'use server';

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

type AvatarFetchResult =
  | { ok: true; contentType: string; buffer: ArrayBuffer }
  | { ok: false; error: Error; shouldRetry: boolean };

async function fetchAvatarImage(imageUrl: string): Promise<AvatarFetchResult> {
  const source = await fetch(imageUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!source.ok) {
    return {
      ok: false,
      error: new Error(`Failed to fetch avatar: ${source.status}`),
      shouldRetry: true,
    };
  }

  const contentType =
    source.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? null;

  if (!contentType?.startsWith('image/')) {
    return {
      ok: false,
      error: new Error(`Invalid content type: ${contentType}`),
      shouldRetry: false,
    };
  }

  const buffer = await source.arrayBuffer();
  return { ok: true, contentType, buffer };
}

type AvatarUploadResult =
  | { ok: true; blobUrl: string; photoId: string }
  | { ok: false; error: Error };

async function uploadAvatarToServer(
  baseUrl: string,
  contentType: string,
  buffer: ArrayBuffer,
  cookieHeader: string | null
): Promise<AvatarUploadResult> {
  const file = new File([buffer], 'oauth-avatar', { type: contentType });
  const formData = new FormData();
  formData.append('file', file);

  const upload = await fetch(`${baseUrl}/api/images/upload`, {
    method: 'POST',
    body: formData,
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    signal: AbortSignal.timeout(30000),
  });

  if (!upload.ok) {
    const errorBody = await upload.text().catch(() => 'Unknown error');
    return {
      ok: false,
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
      error: new Error('Upload response missing required fields'),
    };
  }

  return { ok: true, blobUrl, photoId };
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
          `[AVATAR_UPLOAD] Fetch failed (attempt ${attempt + 1}/${maxRetries}):`,
          lastError.message
        );
        if (!fetchResult.shouldRetry) break;
        continue;
      }

      const uploadResult = await uploadAvatarToServer(
        params.baseUrl,
        fetchResult.contentType,
        fetchResult.buffer,
        params.cookieHeader
      );

      if (!uploadResult.ok) {
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
      return {
        blobUrl: uploadResult.blobUrl,
        photoId: uploadResult.photoId,
        retriesUsed: attempt,
      };
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

function validateOnboardingInput(
  username: string,
  displayName?: string
): { trimmedDisplayName: string } {
  const validation = validateUsername(username);
  if (!validation.isValid) {
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.INVALID_USERNAME,
        validation.error || 'Invalid username'
      )
    );
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
    throw onboardingErrorToError(
      createOnboardingError(
        OnboardingErrorCode.DISPLAY_NAME_TOO_LONG,
        'Display name must be 50 characters or less'
      )
    );
  }

  return { trimmedDisplayName };
}

async function processAvatarUpload(
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
    // Capture to Sentry for monitoring (non-blocking, warning level)
    Sentry.captureException(avatarError, {
      tags: { context: 'onboarding_avatar_upload', profileId },
      level: 'warning',
    });
  }
}

interface DatabaseErrorShape {
  code?: string;
  constraint?: string;
  detail?: string;
  hint?: string;
  table?: string;
  column?: string;
  cause?: unknown;
}

function logAndCaptureError(
  error: unknown,
  username: string,
  displayName?: string,
  email?: string | null
): Error {
  console.error('🔴 ONBOARDING ERROR:', error);
  console.error(
    '🔴 ERROR STACK:',
    error instanceof Error ? error.stack : 'No stack available'
  );

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
    username,
    displayName,
    email,
    timestamp: new Date().toISOString(),
    errorName: error instanceof Error ? error.name : 'Unknown',
    errorMessage: error instanceof Error ? error.message : String(error),
  });

  Sentry.captureException(error, {
    tags: { context: 'onboarding_submission', username: username ?? 'unknown' },
    extra: {
      displayName,
      email,
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
    const { userId } = await auth();
    if (!userId) {
      throw onboardingErrorToError(
        createOnboardingError(
          OnboardingErrorCode.NOT_AUTHENTICATED,
          'User not authenticated'
        )
      );
    }

    const { trimmedDisplayName } = validateOnboardingInput(username, displayName);

    const headersList = await headers();
    const clientIP = extractClientIP(headersList);
    const cookieHeader = headersList.get('cookie');
    const baseUrl = getRequestBaseUrl(headersList);

    const clerkUser = await currentUser();
    const clerkIdentity = resolveClerkIdentity(clerkUser);
    const oauthAvatarUrl = clerkIdentity.avatarUrl;

    await enforceOnboardingRateLimit({ userId, ip: clientIP, checkIP: true });

    const normalizedUsername = normalizeUsername(username);
    const userEmail = email ?? clerkIdentity.email ?? null;

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
              createOnboardingError(OnboardingErrorCode.EMAIL_IN_USE, 'Email is already in use')
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
              createOnboardingError(OnboardingErrorCode.USERNAME_TAKEN, 'Handle already taken')
            );
          }
        };

        const createNewProfile = async (): Promise<CompletionResult> => {
          await ensureEmailAvailable();
          await ensureHandleAvailable(null);
          const result = await tx.execute(
            drizzleSql<{ profile_id: string }>`
              SELECT create_profile_with_user(
                ${clerkUserId}, ${userEmail ?? null}, ${normalizedUsername}, ${trimmedDisplayName}
              ) AS profile_id
            `
          );
          return {
            username: normalizedUsername,
            status: 'created',
            profileId: result.rows?.[0]?.profile_id ? String(result.rows[0].profile_id) : null,
          };
        };

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        if (!existingUser) return createNewProfile();

        const [existingProfile] = await tx
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, existingUser.id))
          .limit(1);

        if (!existingProfile) return createNewProfile();

        const handleChanged = existingProfile.usernameNormalized !== normalizedUsername;
        if (handleChanged) await ensureHandleAvailable(existingProfile.id);

        const needsPublish = !profileIsPublishable(existingProfile);
        const needsClaim = !existingProfile.isClaimed;

        if (needsPublish || handleChanged || needsClaim) {
          const [updated] = await tx
            .update(creatorProfiles)
            .set({
              username: normalizedUsername,
              usernameNormalized: normalizedUsername,
              displayName: trimmedDisplayName || existingProfile.displayName || username,
              onboardingCompletedAt: existingProfile.onboardingCompletedAt ?? new Date(),
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
          };
        }

        return {
          username: existingProfile.usernameNormalized,
          status: 'complete',
          profileId: existingProfile.id,
        };
      },
      { isolationLevel: 'serializable' }
    );

    // Step 7: Avatar upload (non-blocking, with retry and logging)
    // Avatar upload failures are logged but don't block onboarding completion
    if (completion.profileId && oauthAvatarUrl) {
      await processAvatarUpload(completion.profileId, oauthAvatarUrl, baseUrl, cookieHeader);
    }

    // Sync username to Clerk (best-effort - don't block onboarding on sync failure)
    // This updates the Clerk user's username to match the Jovie handle
    try {
      await syncCanonicalUsernameFromApp(userId, completion.username);
    } catch (usernameSyncError) {
      console.error(
        '[ONBOARDING] Failed to sync username to Clerk:',
        usernameSyncError
      );
      Sentry.captureException(usernameSyncError, {
        tags: {
          context: 'onboarding_username_sync',
          username: completion.username,
        },
      });
      // Continue with onboarding - username sync is not critical
      // The user can still use Jovie with their handle; Clerk username may differ
    }

    try {
      await syncAllClerkMetadata(userId);
    } catch (metadataSyncError) {
      console.error(
        '[ONBOARDING] Failed to sync Clerk metadata:',
        metadataSyncError
      );
      Sentry.captureException(metadataSyncError, {
        tags: {
          context: 'onboarding_metadata_sync',
          username: completion.username,
        },
      });
      // Continue with onboarding - metadata sync is not critical
    }

    const cookieStore = await cookies();
    cookieStore.set('jovie_onboarding_complete', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 120,
      path: '/',
    });

    revalidatePath('/app', 'layout');

    if (redirectToDashboard) {
      redirect('/app/dashboard');
    }

    return completion;
  } catch (error) {
    throw logAndCaptureError(error, username, displayName, email);
  }
}
