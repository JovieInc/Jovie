/**
 * Onboarding completion orchestration
 */

'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { attachFirstTouchReceipt } from '@/lib/acquisition/activation-receipt';
import { recordFunnelStep } from '@/lib/analytics/signup-funnel.server';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { resolveUserIdentity } from '@/lib/auth/user-identity';
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
  createOnboardingReceiptPendingError,
  isHandleUniqueViolation,
  OnboardingErrorCode,
  onboardingErrorToError,
} from '@/lib/errors/onboarding';
import { attributeLeadSignupFromAppUserId } from '@/lib/leads/funnel-events';
import { cacheHandleAvailability } from '@/lib/onboarding/handle-availability-cache';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { isTokenBackedClaimFixture } from '@/lib/profile/public-profile-identity-policy';
import {
  type ServerAnalyticsDelivery,
  trackServerEventTx,
} from '@/lib/server-analytics';
import { getAccountMetricCohort } from '@/lib/utils/email';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { isContentClean } from '@/lib/validation/content-filter';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';
import { markWaitlistSignedUpInTx } from '@/lib/waitlist/signup';
import { handleBackgroundAvatarUpload } from './avatar';
import { logOnboardingError } from './errors';
import { profileIsPublishable } from './helpers';
import {
  finalizePostOnboarding,
  runBoundedPostOnboardingSideEffect,
} from './post-onboarding';
import {
  createProfileForExistingUser,
  createUserAndProfile,
  deactivateOrphanedProfiles,
  fetchExistingProfile,
  fetchExistingUser,
  updateExistingProfile,
} from './profile-setup';
import type { CompletionResult, OnboardingCompletionResult } from './types';
import { ensureEmailAvailable, ensureHandleAvailable } from './validation';

function hasVerifiedTokenBackedFixtureClaim(
  normalizedUsername: string,
  pendingClaim: PendingClaimContext | null
): boolean {
  return (
    isTokenBackedClaimFixture(normalizedUsername) &&
    pendingClaim?.mode === 'token_backed' &&
    pendingClaim.username === normalizedUsername &&
    Boolean(pendingClaim.claimTokenHash)
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

async function recordFunnelDelivery(
  event: string,
  delivery: ServerAnalyticsDelivery
): Promise<void> {
  if (delivery.ok) return;
  // Contract/prepare failures are deterministic bugs, not transient loss: a
  // database failure throws inside the transaction and rolls the state write
  // back with it, so an undelivered event here means our contract is wrong.
  const error = new Error(
    `Onboarding funnel event rejected: ${event} (${delivery.error})`
  );
  await captureError(`onboarding funnel event rejected: ${event}`, error, {
    route: 'onboarding',
    event,
  });
  throw error;
}

/**
 * Revenue-critical funnel events emitted atomically inside the onboarding
 * serializable transaction. If the transaction commits, the durable event
 * exists; if the insert fails, the whole claim/signup rolls back so a
 * successful state transition can never go unmeasured. Stable
 * `eventIdentity` values deduplicate retries, double submissions, and
 * multi-tab races.
 */
async function emitOnboardingFunnelEventsTx(
  tx: DbOrTransaction,
  params: {
    pendingClaim: PendingClaimContext | null;
    result: CompletionResult;
  }
): Promise<void> {
  const { pendingClaim, result } = params;
  if (!result.profileId) return;

  // Direct-profile onboarding only reserves the profile here. Spotify
  // ownership verification and the actual claim happen later in
  // connectOnboardingSpotifyArtist, which atomically emits claim completion
  // and activation. Recording either event at reservation time would count
  // abandoned or mismatched claims as successful and consume their durable
  // identities before the verified transaction runs.
  const completesClaim = pendingClaim?.mode !== 'direct_profile';

  if (pendingClaim && completesClaim) {
    await recordFunnelDelivery(
      'claim_completed',
      await trackServerEventTx(
        tx,
        'claim_completed',
        { profileId: result.profileId, source: pendingClaim.mode },
        { eventIdentity: `claim_completed:${result.profileId}` }
      )
    );
  }

  await recordFunnelDelivery(
    'signup_completed',
    await trackServerEventTx(
      tx,
      'signup_completed',
      { profileId: result.profileId, source: pendingClaim?.mode ?? 'organic' },
      { eventIdentity: `signup_completed:${result.profileId}` }
    )
  );

  if (completesClaim) {
    // Canonical self-serve activation: onboarding completed on the claimed
    // profile. Durable and queryable without GA4; the client magic_moment
    // marker remains supplemental telemetry.
    await recordFunnelDelivery(
      'activation_achieved',
      await trackServerEventTx(
        tx,
        'activation_achieved',
        { profileId: result.profileId, source: 'onboarding_completed' },
        { eventIdentity: `activation_achieved:${result.profileId}` }
      )
    );
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
    claimTokenHash: pendingClaim.claimTokenHash,
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

/** Funnel reason for a failed claim; null for Next's redirect control flow. */
function getClaimFailureReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('NEXT_REDIRECT')) return null;
  if (message.includes('PROFILE_CONFLICT')) return 'profile_conflict';
  if (message.includes('CLAIM_NOT_FOUND')) return 'claim_not_found';
  return 'failed';
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
}): Promise<OnboardingCompletionResult> {
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

    const normalizedUsername = normalizeUsername(username);
    pendingClaim = await readPendingClaimContext({
      username: normalizedUsername,
    });
    const hasVerifiedFixtureClaimContext = hasVerifiedTokenBackedFixtureClaim(
      normalizedUsername,
      pendingClaim
    );

    // Step 2: Input validation. Reserved fixtures stay unavailable to general
    // onboarding; only a signed token-backed pending context may proceed to
    // the transaction, where its token hash is checked against the locked row.
    const validation = validateUsername(username);
    if (!validation.isValid && !hasVerifiedFixtureClaimContext) {
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

    const currentUser = await getCachedCurrentUser();
    const userIdentity = resolveUserIdentity(currentUser);
    const oauthAvatarUrl = userIdentity.avatarUrl;

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
    const userEmail = email ?? userIdentity.email ?? null;

    // CRITICAL: Use SERIALIZABLE isolation level to prevent race conditions
    // where two users could claim the same handle simultaneously.
    // This ensures that concurrent transactions will see a consistent view
    // of the data and will fail if there's a conflict.
    const completion = await withRetry(
      () =>
        withDbSessionTx(
          async (tx, clerkUserId: string) => {
            const existingUser = await fetchExistingUser(tx, clerkUserId);
            let result: CompletionResult;

            if (pendingClaim) {
              result = await applyPendingClaimTx(
                tx,
                clerkUserId,
                pendingClaim,
                existingUser?.id ?? null,
                userEmail,
                normalizedUsername,
                trimmedDisplayName
              );
              if (pendingClaim.mode !== 'direct_profile') {
                await markWaitlistSignedUpInTx(tx, clerkUserId);
              }
              await emitOnboardingFunnelEventsTx(tx, {
                pendingClaim,
                result,
              });
              return result;
            }

            // If the user record does not exist, the stored function will create both user + profile
            if (!existingUser) {
              if (userEmail) {
                await ensureEmailAvailable(tx, clerkUserId, userEmail);
              }
              await ensureHandleAvailable(tx, normalizedUsername, null);
              result = await createUserAndProfile(
                tx,
                clerkUserId,
                userEmail,
                normalizedUsername,
                trimmedDisplayName
              );
              await markWaitlistSignedUpInTx(tx, clerkUserId);
              await emitOnboardingFunnelEventsTx(tx, {
                pendingClaim,
                result,
              });
              return result;
            }

            result = await applyExistingUserProfileTx(
              tx,
              clerkUserId,
              existingUser.id,
              userEmail,
              normalizedUsername,
              trimmedDisplayName,
              username
            );
            await markWaitlistSignedUpInTx(tx, clerkUserId);
            await emitOnboardingFunnelEventsTx(tx, {
              pendingClaim,
              result,
            });
            return result;
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

    // Await proxy user state cache invalidation BEFORE the redirect so
    // middleware sees fresh state on the user's next navigation. A stale
    // cache would rewrite a completed user back to /start (onboarding),
    // creating a redirect loop. The 50-200ms cost is acceptable on the
    // critical path.
    try {
      await invalidateProxyUserStateCache(userId);
    } catch (error) {
      await captureError('invalidate_proxy_user_state_cache failed', error, {
        route: 'onboarding',
        userId,
      });
    }

    // Required receipts are awaited before reporting success. Failure keeps
    // the attribution cookie so the completed transaction can be reconciled.
    try {
      await attributeLeadSignupFromAppUserId(userId);
    } catch (error) {
      throw createOnboardingReceiptPendingError(error);
    }

    // Passive first-touch receipt (JOV-5036): attach the pre-auth envelope
    // exactly once. Best-effort — the helper swallows and reports failures
    // so attribution cannot regress activation.
    await attachFirstTouchReceipt(userId);

    if (pendingClaim?.mode === 'token_backed') {
      await clearPendingClaimContext();
    }

    // Remaining side effects are fire-and-forget — they don't affect routing.
    await Promise.allSettled([
      runBoundedPostOnboardingSideEffect(
        'cache_handle_availability',
        () => cacheHandleAvailability(completion.username, false),
        {
          username: completion.username,
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

    // ENG-002: Set completion cookie to prevent redirect loop race condition.
    // Onboarding is complete at this point regardless of the finalization
    // path — direct_profile claims skip finalizePostOnboarding but still
    // need the cookie so the proxy doesn't bounce the user back to /start.
    const cookieStore = await cookies();
    cookieStore.set('jovie_onboarding_complete', '1', {
      httpOnly: true,
      secure: isSecureEnv(),
      sameSite: 'lax',
      maxAge: 120,
      path: '/',
    });

    // Steps 8-9: Durable bounded sync + trial activation
    if (shouldFinalizeOnboarding) {
      await finalizePostOnboarding(userId, completion.username);
    }

    await recordFunnelStep({
      funnel: 'artist_signup',
      step: 'claim_complete',
      cohort: getAccountMetricCohort(userEmail),
    });

    // Invalidate dashboard data cache to prevent stale data causing redirect loops
    // This ensures the app layout gets fresh data showing onboarding is complete
    revalidatePath(APP_ROUTES.DASHBOARD, 'layout');

    if (redirectToDashboard) {
      redirect(`${APP_ROUTES.DASHBOARD}?interview=1`);
    }

    return completion;
  } catch (error) {
    const claimExpired =
      pendingClaim?.mode === 'token_backed' &&
      error instanceof Error &&
      error.message.startsWith('[CLAIM_EXPIRED]');
    if (
      pendingClaim &&
      error instanceof Error &&
      (error.message.includes('PROFILE_CONFLICT') ||
        error.message.includes('CLAIM_NOT_FOUND') ||
        claimExpired)
    ) {
      await clearPendingClaimContext();
    }
    const failureReason = getClaimFailureReason(error);
    if (failureReason) {
      await recordFunnelStep({
        funnel: 'artist_signup',
        step: 'claim_complete',
        outcome: 'error',
        reason: failureReason,
      });
    }
    await captureError('completeOnboarding failed', error, {
      route: 'onboarding',
    });
    const loggedError = logOnboardingError(error, {
      username,
      displayName,
      email,
    });
    // Next hides thrown Server Action messages in production. Return only the
    // known recovery code; provider/database errors remain on the thrown path.
    if (claimExpired) return { error: 'CLAIM_EXPIRED' };
    throw loggedError;
  }
}
