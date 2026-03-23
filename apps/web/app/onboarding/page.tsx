import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from '@/features/auth';
import { PROFILE_REVIEW_STEP_INDEX } from '@/features/dashboard/organisms/apple-style-onboarding/types';
import { OnboardingFormWrapper } from '@/features/dashboard/organisms/OnboardingFormWrapper';
import { resolveInitialStep } from '@/features/dashboard/organisms/onboarding/profile-review-guards';
import { getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { reserveOnboardingHandle } from '@/lib/onboarding/reserved-handle';
import { extractErrorMessage } from '@/lib/utils/errors';

interface OnboardingPageProps {
  readonly searchParams?: Promise<{
    readonly handle?: string;
  }>;
}

/**
 * Onboarding page.
 *
 * proxy.ts routes users here when they need onboarding. The only redirect
 * is an ACTIVE guard: if an already-active user reaches this page (via
 * stale proxy cache, direct URL, or browser back button), redirect them
 * to /app to break potential redirect loops.
 */
export default async function OnboardingPage({
  searchParams,
}: Readonly<OnboardingPageProps>) {
  const resolvedSearchParams = await searchParams;
  const shouldSkipDashboardPrefetch =
    process.env.E2E_FAST_ONBOARDING === '1' &&
    Boolean(resolvedSearchParams?.handle);

  const authResult = await resolveUserState();

  // Gate blocked states — proxy normally prevents these from reaching here,
  // but the page must not render for banned/failed users regardless.
  if (authResult.state === CanonicalUserState.BANNED) {
    redirect('/banned');
  }
  if (authResult.state === CanonicalUserState.USER_CREATION_FAILED) {
    redirect('/error/user-creation-failed');
  }
  if (
    authResult.state === CanonicalUserState.NEEDS_WAITLIST_SUBMISSION ||
    authResult.state === CanonicalUserState.WAITLIST_PENDING
  ) {
    redirect(APP_ROUTES.WAITLIST);
  }

  // ACTIVE guard: break redirect loops caused by stale proxy cache or
  // direct navigation. If the user is already active, send them to /app.
  if (authResult.state === CanonicalUserState.ACTIVE) {
    redirect('/app');
  }

  // Defensive check: ensure we have a valid Clerk user ID
  // This can happen legitimately in certain scenarios:
  // - Clerk bypass/mock mode is enabled
  // - Session expired between proxy.ts and page render
  // - Clerk context propagation race condition
  if (!authResult.clerkUserId) {
    const isClerkBypassed =
      publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
      !publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    // Only report to Sentry if this is truly unexpected (not bypass mode)
    if (!isClerkBypassed) {
      Sentry.captureMessage('Missing clerkUserId despite proxy routing', {
        level: 'warning', // Changed from 'error' - this is handled gracefully
        tags: {
          context: 'onboarding_defensive_check',
          vercel_env: env.VERCEL_ENV || 'unknown',
        },
        extra: {
          userState: authResult.state,
          hasDbUser: !!authResult.dbUserId,
        },
      });
    }
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.ONBOARDING}`);
  }

  const user = await getCachedCurrentUser();
  const clerkIdentity = resolveClerkIdentity(user);
  const userEmail = authResult.context.email ?? clerkIdentity.email ?? null;
  const userId = authResult.clerkUserId;

  // Try to get existing profile data if available (user might be partially onboarded)
  // This is optional - if it fails, we just don't pre-fill
  let existingProfile = null;
  if (!shouldSkipDashboardPrefetch) {
    try {
      const dashboardData = await getDashboardData();
      existingProfile = dashboardData.selectedProfile;
    } catch (error) {
      // Capture database/connection errors to Sentry (but not "no profile" errors)
      const errorMessage = extractErrorMessage(error, 'Unknown error');
      if (
        errorMessage.includes('database') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout')
      ) {
        Sentry.captureException(error, {
          tags: { context: 'onboarding_profile_load' },
          extra: { clerkUserId: authResult.clerkUserId },
        });
      }
    }
  }

  const initialDisplayName =
    existingProfile?.displayName || clerkIdentity.displayName || '';

  // Step-resume: existing user with completed onboarding but missing photo
  // Routes them directly to profile review to upload a photo
  const initialStepIndex = resolveInitialStep(
    existingProfile
      ? {
          onboardingCompletedAt: existingProfile.onboardingCompletedAt ?? null,
          avatarUrl: existingProfile.avatarUrl ?? null,
        }
      : null,
    PROFILE_REVIEW_STEP_INDEX
  );

  const spotifySuggestedHandle = clerkIdentity.spotifyUsername ?? '';

  const providedHandle =
    resolvedSearchParams?.handle ||
    existingProfile?.username ||
    user?.username ||
    spotifySuggestedHandle;

  const shouldReserveHandle = !providedHandle;
  const reservedHandle = shouldReserveHandle
    ? await reserveOnboardingHandle(initialDisplayName)
    : null;

  const initialHandle = providedHandle || reservedHandle || '';

  const shouldAutoSubmitHandle =
    Boolean(spotifySuggestedHandle) &&
    !resolvedSearchParams?.handle &&
    !existingProfile?.username &&
    !user?.username;

  return (
    <AuthLayout
      formTitle='Choose your handle'
      showFooterPrompt={false}
      showFormTitle={false}
      logoSpinDelayMs={10000}
      showLogoutButton
      logoutRedirectUrl={APP_ROUTES.SIGNIN}
    >
      <div className='relative min-h-[500px]'>
        {/* Unified onboarding form */}
        <OnboardingFormWrapper
          initialDisplayName={initialDisplayName}
          initialHandle={initialHandle}
          isReservedHandle={Boolean(reservedHandle)}
          userEmail={userEmail}
          userId={userId}
          shouldAutoSubmitHandle={shouldAutoSubmitHandle}
          initialStepIndex={initialStepIndex}
          existingAvatarUrl={existingProfile?.avatarUrl ?? null}
          existingBio={existingProfile?.bio ?? null}
          existingGenres={existingProfile?.genres ?? null}
        />
      </div>
    </AuthLayout>
  );
}
