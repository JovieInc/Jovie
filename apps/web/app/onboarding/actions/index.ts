/**
 * Onboarding completion orchestration
 */

'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import {
  clearPendingClaimContext,
  readPendingClaimContext,
} from '@/lib/claim/context';
import {
  claimPrebuiltProfileForUser,
  ensureOnboardingUserRow,
  reservePrebuiltProfileForUser,
} from '@/lib/claim/finalize';
import type { PendingClaimContext } from '@/lib/claim/types';
import type { DbOrTransaction } from '@/lib/db';
import { withRetry } from '@/lib/db/client';
import { isSecureEnv } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import {
  createOnboardingError,
  OnboardingErrorCode,
  onboardingErrorToError,
  unwrapDatabaseError,
} from '@/lib/errors/onboarding';
import { attributeLeadSignupFromClerkUserId } from '@/lib/leads/funnel-events';
import { cacheHandleAvailability } from '@/lib/onboarding/handle-availability-cache';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { withTimeout } from '@/lib/resilience/primitives';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { isContentClean } from '@/lib/validation/content-filter';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';
import { handleBackgroundAvatarUpload } from './avatar';
import { logOnboardingError } from './errors';
import { profileIsPublishable } from './helpers';
import {
  createProfileForExistingUser,
  createUserAndProfile,
  deactivateOrphanedProfiles,
  fetchExistingProfile,
  fetchExistingUser,
  updateExistingProfile,
} from './profile-setup';
import { runBackgroundSyncOperations } from './sync';
import type { CompletionResult } from './types';
import { ensureEmailAvailable, ensureHandleAvailable } from './validation';

const POST_ONBOARDING_SIDE_EFFECT_TIMEOUT_MS = 2_000;

function isHandleUniqueViolation(error: unknown): boolean {
  const unwrapped = unwrapDatabaseError(error);
  const message = (
    unwrapped.message || (error instanceof Error ? error.message : '')
  ).toLowerCase();
  const constraint = (unwrapped.constraint ?? '').toLowerCase();
  const detail = (unwrapped.detail ?? '').toLowerCase();

  if (unwrapped.code !== '23505' && !message.includes('duplicate')) {
    return false;
  }

  return (
    constraint.includes('creator_profiles_username_normalized_unique') ||
    message.includes('username_normalized') ||
    detail.includes('username_normalized') ||
    detail.includes('username')
  );
}

async function recoverConcurrentProfileClaim(
  clerkUserId: string,
  normalizedUsername: string
): Promise<CompletionResult | null> {
  return withDbSessionTx(async tx => {
    const existingUser = await fetchExistingUser(tx, clerkUserId);
    if (!existingUser) {
      return null;
    }

    const existingProfile = await fetchExistingProfile(tx, existingUser.id);
    if (!existingProfile) {
      return null;
    }

    if (existingProfile.usernameNormalized !== normalizedUsername) {
      return null;
    }

    return {
      username: existingProfile.usernameNormalized,
      status: 'complete',
      profileId: existingProfile.id,
    };
  });
}

async function runBoundedPostOnboardingSideEffect(
  context: string,
  operation: () => Promise<void>,
  contextData?: Record<string, string | null | undefined>
): Promise<void> {
  try {
    await withTimeout(operation(), {
      timeoutMs: POST_ONBOARDING_SIDE_EFFECT_TIMEOUT_MS,
      context,
    });
  } catch (error) {
    await captureError(`${context} failed`, error, {
      route: 'onboarding',
      contextData,
    });
  }
}

async function applyPendingClaimTx(
  tx: DbOrTransaction,
  clerkUserId: string,
  pendingClaim: PendingClaimContext,
  existingUserId: string | null,
  userEmail: string | null,
  normalizedUsername: string,
  displayName: string
): Promise<CompletionResult> {
  const userRecord =
    existingUserId === null
      ? await (async () => {
          if (userEmail) {
            await ensureEmailAvailable(tx, clerkUserId, userEmail);
          }
          return ensureOnboardingUserRow(tx, { clerkUserId, userEmail });
        })()
      : { id: existingUserId };

  const existingProfile = await fetchExistingProfile(tx, userRecord.id);

  if (
    existingProfile?.isClaimed &&
    existingProfile.id !== pendingClaim.creatorProfileId
  ) {
    throw new Error(
      `[PROFILE_CONFLICT] You already own @${existingProfile.usernameNormalized}.`
    );
  }

  if (pendingClaim.mode === 'direct_profile') {
    return reservePrebuiltProfileForUser(tx, {
      userId: userRecord.id,
      creatorProfileId: pendingClaim.creatorProfileId,
      expectedUsername: normalizedUsername,
      displayName,
    });
  }

  return claimPrebuiltProfileForUser(tx, {
    userId: userRecord.id,
    creatorProfileId: pendingClaim.creatorProfileId,
    expectedUsername: normalizedUsername,
    displayName,
    source: 'token_backed_onboarding',
    finalizeOnboarding: true,
  });
}

async function applyExistingUserProfileTx(
  tx: DbOrTransaction,
  clerkUserId: string,
  existingUserId: string,
  userEmail: string | null,
  normalizedUsername: string,
  displayName: string,
  rawUsername: string
): Promise<CompletionResult> {
  const existingProfile = await fetchExistingProfile(tx, existingUserId);

  const handleChanged =
    existingProfile?.usernameNormalized !== normalizedUsername;

  if (handleChanged) {
    await ensureHandleAvailable(tx, normalizedUsername, existingProfile?.id);
  }

  const needsPublish = !profileIsPublishable(existingProfile);
  // CRITICAL: Also update if isClaimed is not set - this is required by gate.ts
  // which filters profiles by isClaimed=true. Without this, users with
  // "publishable" profiles but isClaimed=false get stuck in an onboarding loop.
  const needsClaim = existingProfile && !existingProfile.isClaimed;

  if (existingProfile && (needsPublish || handleChanged || needsClaim)) {
    const result = await updateExistingProfile(
      tx,
      existingProfile,
      normalizedUsername,
      displayName,
      rawUsername
    );

    if (result.profileId) {
      await deactivateOrphanedProfiles(tx, existingUserId, result.profileId);
    }

    return result;
  }

  if (existingProfile) {
    return {
      username: existingProfile.usernameNormalized,
      status: 'complete',
      profileId: existingProfile.id,
    };
  }

  // Fallback: user exists but no profile yet
  if (userEmail) {
    await ensureEmailAvailable(tx, clerkUserId, userEmail);
  }
  await ensureHandleAvailable(tx, normalizedUsername, null);
  const newProfile = await createProfileForExistingUser(
    tx,
    existingUserId,
    normalizedUsername,
    displayName
  );

  if (newProfile.profileId) {
    await deactivateOrphanedProfiles(tx, existingUserId, newProfile.profileId);
  }

  return newProfile;
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
}): Promise<CompletionResult> {
  let pendingClaim: Awaited<ReturnType<typeof readPendingClaimContext>> = null;

  try {
    // Step 1: Authentication check
    const { userId } = await getCachedAuth();
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

    if (!isContentClean(trimmedDisplayName)) {
      const error = createOnboardingError(
        OnboardingErrorCode.INVALID_DISPLAY_NAME,
        'Display name contains language that is not allowed'
      );
      throw onboardingErrorToError(error);
    }

    // Step 3: Rate limiting check
    const headersList = await headers();
    const clientIP = extractClientIP(headersList);
    const cookieHeader = headersList.get('cookie');

    const clerkUser = await getCachedCurrentUser();
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
    pendingClaim = await readPendingClaimContext({
      username: normalizedUsername,
    });

    const userEmail = email ?? clerkIdentity.email ?? null;

    // CRITICAL: Use SERIALIZABLE isolation level to prevent race conditions
    // where two users could claim the same handle simultaneously.
    // This ensures that concurrent transactions will see a consistent view
    // of the data and will fail if there's a conflict.
    const completion = await withRetry(
      () =>
        withDbSessionTx(
          async (tx, clerkUserId: string) => {
            const existingUser = await fetchExistingUser(tx, clerkUserId);

            if (pendingClaim) {
              return applyPendingClaimTx(
                tx,
                clerkUserId,
                pendingClaim,
                existingUser?.id ?? null,
                userEmail,
                normalizedUsername,
                trimmedDisplayName
              );
            }

            // If the user record does not exist, the stored function will create both user + profile
            if (!existingUser) {
              if (userEmail) {
                await ensureEmailAvailable(tx, clerkUserId, userEmail);
              }
              await ensureHandleAvailable(tx, normalizedUsername, null);
              return createUserAndProfile(
                tx,
                clerkUserId,
                userEmail,
                normalizedUsername,
                trimmedDisplayName
              );
            }

            return applyExistingUserProfileTx(
              tx,
              clerkUserId,
              existingUser.id,
              userEmail,
              normalizedUsername,
              trimmedDisplayName,
              username
            );
          },
          { isolationLevel: 'serializable' }
        ),
      'completeOnboarding'
    ).catch(async error => {
      if (!isHandleUniqueViolation(error)) {
        throw error;
      }

      const recovered = await recoverConcurrentProfileClaim(
        userId,
        normalizedUsername
      );

      if (recovered) {
        return recovered;
      }

      throw error;
    });

    if (pendingClaim?.mode === 'token_backed') {
      await clearPendingClaimContext();
    }

    await Promise.allSettled([
      runBoundedPostOnboardingSideEffect(
        'cache_handle_availability',
        () => cacheHandleAvailability(completion.username, false),
        {
          username: completion.username,
        }
      ),
      // Immediately invalidate user state cache so middleware sees fresh state.
      // This is best-effort because the completion cookie below also prevents
      // redirect loops during the handoff to /app.
      runBoundedPostOnboardingSideEffect(
        'invalidate_proxy_user_state_cache',
        () => invalidateProxyUserStateCache(userId),
        {
          userId,
        }
      ),
      runBoundedPostOnboardingSideEffect(
        'attribute_lead_signup',
        () => attributeLeadSignupFromClerkUserId(userId).then(() => {}),
        {
          userId,
        }
      ),
      runBoundedPostOnboardingSideEffect(
        'invalidate_profile_cache',
        () => invalidateProfileCache(completion.username),
        {
          username: completion.username,
        }
      ),
    ]);

    // Step 7: Avatar upload (fire-and-forget, background processing)
    const shouldFinalizeOnboarding = pendingClaim?.mode !== 'direct_profile';
    const profileId = completion.profileId;
    if (profileId && oauthAvatarUrl) {
      void handleBackgroundAvatarUpload(
        profileId,
        oauthAvatarUrl,
        cookieHeader
      );
    }

    // Step 8: Sync operations (parallel, fire-and-forget)
    if (shouldFinalizeOnboarding) {
      runBackgroundSyncOperations(userId, completion.username);
    }

    // Step 9: Activate 14-day Pro trial (fire-and-forget)
    if (shouldFinalizeOnboarding) {
      void import('./activate-trial').then(({ activateTrial }) =>
        activateTrial(userId)
      );
    }

    if (shouldFinalizeOnboarding) {
      // ENG-002: Set completion cookie to prevent redirect loop race condition
      const cookieStore = await cookies();
      cookieStore.set('jovie_onboarding_complete', '1', {
        httpOnly: true,
        secure: isSecureEnv(),
        sameSite: 'lax',
        maxAge: 120,
        path: '/',
      });
    }

    // Invalidate dashboard data cache to prevent stale data causing redirect loops
    // This ensures the app layout gets fresh data showing onboarding is complete
    revalidatePath(APP_ROUTES.DASHBOARD, 'layout');

    if (redirectToDashboard) {
      redirect(`${APP_ROUTES.DASHBOARD}?interview=1`);
    }

    return completion;
  } catch (error) {
    if (
      pendingClaim &&
      error instanceof Error &&
      (error.message.includes('PROFILE_CONFLICT') ||
        error.message.includes('CLAIM_NOT_FOUND'))
    ) {
      await clearPendingClaimContext();
    }
    await captureError('completeOnboarding failed', error, {
      route: 'onboarding',
    });
    throw logOnboardingError(error, { username, displayName, email });
  }
}
