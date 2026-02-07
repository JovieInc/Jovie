/**
 * Onboarding completion orchestration
 */

'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { isSecureEnv } from '@/lib/env-server';
import {
  createOnboardingError,
  OnboardingErrorCode,
  onboardingErrorToError,
} from '@/lib/errors/onboarding';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';
import { handleBackgroundAvatarUpload } from './avatar';
import { logOnboardingError } from './errors';
import { getRequestBaseUrl, profileIsPublishable } from './helpers';
import {
  createUserAndProfile,
  fetchExistingProfile,
  fetchExistingUser,
  updateExistingProfile,
} from './profile-setup';
import { runBackgroundSyncOperations } from './sync';
import type { CompletionResult } from './types';
import { ensureEmailAvailable, ensureHandleAvailable } from './validation';

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
        const existingUser = await fetchExistingUser(tx, clerkUserId);

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

        const existingProfile = await fetchExistingProfile(tx, existingUser.id);

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

    // Invalidate public profile cache so the profile page reflects the new isPublic state.
    // Without this, a stale not_found result cached by unstable_cache would persist
    // for up to 1 hour after onboarding completes (e.g., waitlist profiles that were
    // previously visited while isPublic was false).
    await invalidateProfileCache(completion.username);

    // Invalidate dashboard data cache to prevent stale data causing redirect loops
    // This ensures the app layout gets fresh data showing onboarding is complete
    revalidatePath(APP_ROUTES.DASHBOARD, 'layout');

    if (redirectToDashboard) {
      redirect(APP_ROUTES.DASHBOARD);
    }

    return completion;
  } catch (error) {
    throw logOnboardingError(error, { username, displayName, email });
  }
}
