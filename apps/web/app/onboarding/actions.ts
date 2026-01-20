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

      const source = await fetch(params.imageUrl, {
        signal: AbortSignal.timeout(10000), // 10s timeout for fetching image
      });

      if (!source.ok) {
        lastError = new Error(`Failed to fetch avatar: ${source.status}`);
        console.warn(
          `[AVATAR_UPLOAD] Fetch failed (attempt ${attempt + 1}/${maxRetries}):`,
          lastError.message
        );
        continue;
      }

      const contentType =
        source.headers.get('content-type')?.split(';')[0]?.toLowerCase() ??
        null;
      if (!contentType?.startsWith('image/')) {
        lastError = new Error(`Invalid content type: ${contentType}`);
        console.warn('[AVATAR_UPLOAD] Invalid content type:', contentType);
        // Don't retry for invalid content type - it won't change
        break;
      }

      const buffer = await source.arrayBuffer();
      const file = new File([buffer], 'oauth-avatar', { type: contentType });

      const formData = new FormData();
      formData.append('file', file);

      const upload = await fetch(`${params.baseUrl}/api/images/upload`, {
        method: 'POST',
        body: formData,
        headers: params.cookieHeader
          ? { cookie: params.cookieHeader }
          : undefined,
        signal: AbortSignal.timeout(30000), // 30s timeout for upload
      });

      if (!upload.ok) {
        const errorBody = await upload.text().catch(() => 'Unknown error');
        lastError = new Error(`Upload failed: ${upload.status} - ${errorBody}`);
        console.warn(
          `[AVATAR_UPLOAD] Upload failed (attempt ${attempt + 1}/${maxRetries}):`,
          lastError.message
        );
        continue;
      }

      const data = (await upload.json()) as {
        blobUrl?: string;
        photoId?: string;
        jobId?: string;
      };

      const blobUrl = data.blobUrl ?? null;
      const photoId = data.photoId ?? data.jobId ?? null;

      if (!blobUrl || !photoId) {
        lastError = new Error('Upload response missing required fields');
        console.warn('[AVATAR_UPLOAD] Invalid response:', data);
        continue;
      }

      // Success - always log for monitoring
      console.info(
        `[AVATAR_UPLOAD] Succeeded (${attempt + 1} attempt${attempt === 0 ? '' : 's'})`
      );
      return { blobUrl, photoId, retriesUsed: attempt };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Unknown upload error');
      console.warn(
        `[AVATAR_UPLOAD] Exception (attempt ${attempt + 1}/${maxRetries}):`,
        lastError.message
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
            const error = createOnboardingError(
              OnboardingErrorCode.USERNAME_TAKEN,
              'Handle already taken'
            );
            throw onboardingErrorToError(error);
          }
        };

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        // If the user record does not exist, the stored function will create both user + profile
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

          const created: CompletionResult = {
            username: normalizedUsername,
            status: 'created',
            profileId,
          };

          return created;
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
          await ensureHandleAvailable(existingProfile?.id);
        }

        const needsPublish = !profileIsPublishable(existingProfile);
        // CRITICAL: Also update if isClaimed is not set - this is required by gate.ts
        // which filters profiles by isClaimed=true. Without this, users with
        // "publishable" profiles but isClaimed=false get stuck in an onboarding loop.
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

          const updatedResult: CompletionResult = {
            username: updated?.usernameNormalized || normalizedUsername,
            status: 'updated',
            profileId: existingProfile.id,
          };

          return updatedResult;
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

        const created: CompletionResult = {
          username: normalizedUsername,
          status: 'created',
          profileId,
        };

        return created;
      },
      { isolationLevel: 'serializable' }
    );

    // Step 7: Avatar upload (non-blocking, with retry and logging)
    // Avatar upload failures are logged but don't block onboarding completion
    const profileId = completion.profileId;

    if (profileId && oauthAvatarUrl) {
      try {
        const uploaded = await uploadRemoteAvatar({
          imageUrl: oauthAvatarUrl,
          baseUrl,
          cookieHeader,
          maxRetries: 3,
        });

        if (uploaded) {
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
        } else {
          console.warn(
            '[ONBOARDING] Avatar upload failed for profile:',
            profileId
          );
        }
      } catch (avatarError) {
        console.error(
          '[ONBOARDING] Avatar upload exception for profile:',
          profileId,
          avatarError
        );
      }
    }

    await syncCanonicalUsernameFromApp(userId, completion.username);

    // Sync Jovie metadata to Clerk (profile completion, status, etc.)
    // This is best-effort - don't block onboarding on sync failure
    try {
      await syncAllClerkMetadata(userId);
    } catch (syncError) {
      console.error('[ONBOARDING] Failed to sync Clerk metadata:', syncError);
      // Continue with onboarding - metadata sync is not critical
    }

    if (redirectToDashboard) {
      // ENG-002: Set completion cookie to prevent redirect loop race condition
      // The proxy checks this cookie and bypasses needsOnboarding check for 30s
      // This handles the race between transaction commit and proxy's DB read
      const cookieStore = await cookies();
      cookieStore.set('jovie_onboarding_complete', '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30, // 30 seconds - enough time to bypass proxy check
        path: '/',
      });

      // Invalidate dashboard data cache to prevent stale data causing redirect loops
      // This ensures the app layout gets fresh data showing onboarding is complete
      revalidatePath('/app', 'layout');
      redirect('/app/dashboard');
    }

    return completion;
  } catch (error) {
    // Enhanced logging with database-specific fields
    console.error('🔴 ONBOARDING ERROR:', error);
    console.error(
      '🔴 ERROR STACK:',
      error instanceof Error ? error.stack : 'No stack available'
    );

    // Log database-specific error details
    // Define shape for PostgreSQL database errors
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
      username,
      displayName,
      email,
      timestamp: new Date().toISOString(),
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    // Capture to Sentry with full context
    Sentry.captureException(error, {
      tags: {
        context: 'onboarding_submission',
        username: username ?? 'unknown',
      },
      extra: {
        displayName,
        email,
        dbErrorCode: dbError?.code,
        dbConstraint: dbError?.constraint,
        dbDetail: dbError?.detail,
      },
    });

    // Normalize unknown errors into onboarding-shaped errors for consistent handling
    const resolvedError =
      error instanceof Error && /^\[([A-Z_]+)\]/.test(error.message)
        ? error
        : onboardingErrorToError(mapDatabaseError(error));

    // Log the resolved error type for monitoring
    console.error('🔴 RESOLVED ERROR TYPE:', resolvedError.message);

    throw resolvedError;
  }
}
