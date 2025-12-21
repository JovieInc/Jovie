'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
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

/**
 * Check if an error is a unique constraint violation on username_normalized.
 * Used to handle race conditions where the username is claimed between
 * the availability check and the insert/update.
 */
function isUsernameUniqueConstraintViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const record = error as unknown as Record<string, unknown>;
  const code = record?.code as string | undefined;
  const message = (record?.message as string | undefined)?.toLowerCase() ?? '';
  const constraint = (record?.constraint as string | undefined)?.toLowerCase();

  // PostgreSQL unique violation code is 23505
  if (code === '23505') {
    return (
      constraint === 'creator_profiles_username_normalized_unique' ||
      message.includes('username_normalized') ||
      message.includes('creator_profiles_username_normalized_unique')
    );
  }

  return false;
}

function getRequestBaseUrl(headersList: Headers): string {
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return publicEnv.NEXT_PUBLIC_APP_URL;
}

async function uploadRemoteAvatar(params: {
  imageUrl: string;
  baseUrl: string;
  cookieHeader: string | null;
}): Promise<{ blobUrl: string; photoId: string } | null> {
  const source = await fetch(params.imageUrl);
  if (!source.ok) return null;

  const contentType =
    source.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? null;
  if (!contentType || !contentType.startsWith('image/')) return null;

  const buffer = await source.arrayBuffer();
  const file = new File([buffer], 'oauth-avatar', { type: contentType });

  const formData = new FormData();
  formData.append('file', file);

  const upload = await fetch(`${params.baseUrl}/api/images/upload`, {
    method: 'POST',
    body: formData,
    headers: params.cookieHeader ? { cookie: params.cookieHeader } : undefined,
  });

  if (!upload.ok) return null;

  const data = (await upload.json()) as {
    blobUrl?: string;
    photoId?: string;
    jobId?: string;
  };

  const blobUrl = data.blobUrl ?? null;
  const photoId = data.photoId ?? data.jobId ?? null;

  if (!blobUrl || !photoId) return null;
  return { blobUrl, photoId };
}

function profileIsPublishable(
  profile: typeof creatorProfiles.$inferSelect | null
) {
  if (!profile) return false;
  const hasHandle =
    Boolean(profile.username) && Boolean(profile.usernameNormalized);
  const hasName = Boolean(profile.displayName && profile.displayName.trim());
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

    const userEmail = email ?? null;

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

          // Wrap in try-catch to handle race conditions where username is
          // claimed between the availability check and the insert
          let result: { rows?: Array<{ profile_id?: string }> };
          try {
            result = await tx.execute(
              drizzleSql<{ profile_id: string }>`
                SELECT create_profile_with_user(
                  ${clerkUserId},
                  ${userEmail ?? null},
                  ${normalizedUsername},
                  ${trimmedDisplayName}
                ) AS profile_id
              `
            );
          } catch (error) {
            if (isUsernameUniqueConstraintViolation(error)) {
              throw onboardingErrorToError(
                createOnboardingError(
                  OnboardingErrorCode.USERNAME_TAKEN,
                  'Handle already taken'
                )
              );
            }
            throw error;
          }

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

        if (existingProfile && (needsPublish || handleChanged)) {
          const nextDisplayName =
            trimmedDisplayName || existingProfile.displayName || username;

          // Wrap in try-catch to handle race conditions where username is
          // claimed between the availability check and the update
          let updated: typeof existingProfile | undefined;
          try {
            [updated] = await tx
              .update(creatorProfiles)
              .set({
                username: normalizedUsername,
                usernameNormalized: normalizedUsername,
                displayName: nextDisplayName,
                onboardingCompletedAt:
                  existingProfile.onboardingCompletedAt ?? new Date(),
                isPublic: true,
                updatedAt: new Date(),
              })
              .where(eq(creatorProfiles.id, existingProfile.id))
              .returning();
          } catch (error) {
            if (isUsernameUniqueConstraintViolation(error)) {
              throw onboardingErrorToError(
                createOnboardingError(
                  OnboardingErrorCode.USERNAME_TAKEN,
                  'Handle already taken'
                )
              );
            }
            throw error;
          }

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

        // Wrap in try-catch to handle race conditions where username is
        // claimed between the availability check and the insert
        let fallbackResult: { rows?: Array<{ profile_id?: string }> };
        try {
          fallbackResult = await tx.execute(
            drizzleSql<{ profile_id: string }>`
              SELECT create_profile_with_user(
                ${clerkUserId},
                ${userEmail ?? null},
                ${normalizedUsername},
                ${trimmedDisplayName}
              ) AS profile_id
            `
          );
        } catch (error) {
          if (isUsernameUniqueConstraintViolation(error)) {
            throw onboardingErrorToError(
              createOnboardingError(
                OnboardingErrorCode.USERNAME_TAKEN,
                'Handle already taken'
              )
            );
          }
          throw error;
        }

        const profileId = fallbackResult.rows?.[0]?.profile_id
          ? String(fallbackResult.rows[0].profile_id)
          : null;

        const created: CompletionResult = {
          username: normalizedUsername,
          status: 'created',
          profileId,
        };

        return created;
      }
    );

    const profileId = completion.profileId;
    if (profileId && oauthAvatarUrl) {
      try {
        const uploaded = await uploadRemoteAvatar({
          imageUrl: oauthAvatarUrl,
          baseUrl,
          cookieHeader,
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
        }
      } catch {
        // ignore
      }
    }

    await syncCanonicalUsernameFromApp(userId, completion.username);

    if (redirectToDashboard) {
      redirect('/app/dashboard/overview');
    }

    return completion;
  } catch (error) {
    console.error('🔴 ONBOARDING ERROR:', error);
    console.error(
      '🔴 ERROR STACK:',
      error instanceof Error ? error.stack : 'No stack available'
    );

    // Normalize unknown errors into onboarding-shaped errors for consistent handling
    const resolvedError =
      error instanceof Error && /^\[([A-Z_]+)\]/.test(error.message)
        ? error
        : onboardingErrorToError(mapDatabaseError(error));

    throw resolvedError;
  }
}
