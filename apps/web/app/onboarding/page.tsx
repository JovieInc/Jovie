import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/(shell)/dashboard/actions';
import { APP_ROUTES } from '@/constants/routes';
import { OnboardingFormWrapper } from '@/features/dashboard/organisms/OnboardingFormWrapper';
import { getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { readPendingClaimContext } from '@/lib/claim/context';
import { isE2EFastOnboardingEnabled } from '@/lib/e2e/runtime';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { reserveOnboardingHandle } from '@/lib/onboarding/reserved-handle';
import { extractErrorMessage } from '@/lib/utils/errors';

interface OnboardingPageProps {
  readonly searchParams?: Promise<{
    readonly handle?: string;
    readonly resume?: string;
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
    isE2EFastOnboardingEnabled() && Boolean(resolvedSearchParams?.handle);

  const authResult = await resolveUserState();

  // Gate blocked states — proxy normally prevents these from reaching here,
  // but the page must not render for banned/failed users regardless.
  if (authResult.state === CanonicalUserState.BANNED) {
    redirect(APP_ROUTES.UNAVAILABLE);
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

  const hasOnboardingContinuationSignal = Boolean(
    resolvedSearchParams?.handle || resolvedSearchParams?.resume
  );

  // ACTIVE guard: break redirect loops caused by stale proxy cache or
  // direct navigation. V2 intentionally allows explicit resume targets
  // after handle completion, because step 0 activates the user record.
  // The handle query is also treated as a continuation signal because
  // completeOnboarding triggers a server rerender before the client can
  // upgrade the URL to a resume target.
  if (
    authResult.state === CanonicalUserState.ACTIVE &&
    !hasOnboardingContinuationSignal
  ) {
    redirect('/app');
  }

  // Defensive check: ensure we have a valid Clerk user ID
  if (!authResult.clerkUserId) {
    reportMissingClerkUserId(authResult);
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.ONBOARDING}`);
  }

  const user = await getCachedCurrentUser();
  const clerkIdentity = resolveClerkIdentity(user);
  const userEmail = authResult.context.email ?? clerkIdentity.email ?? null;
  const userId = authResult.clerkUserId;
  const pendingClaim = await readPendingClaimContext();

  // Run profile prefetch and handle reservation in parallel (they're independent)
  const spotifySuggestedHandle = clerkIdentity.spotifyUsername ?? '';

  const profilePrefetchPromise = shouldSkipDashboardPrefetch
    ? Promise.resolve(null)
    : getDashboardData()
        .then(d => d.selectedProfile)
        .catch((error: unknown) => {
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
          return null;
        });

  // Start handle reservation early with what we know now (display name from Clerk)
  const earlyDisplayName = clerkIdentity.displayName || '';
  const earlyProvidedHandle =
    resolvedSearchParams?.handle ||
    pendingClaim?.username ||
    spotifySuggestedHandle;
  const handleReservationPromise = !earlyProvidedHandle
    ? reserveOnboardingHandle(earlyDisplayName)
    : Promise.resolve(null);

  // Await both in parallel
  const [existingProfile, earlyReservedHandle] = await Promise.all([
    profilePrefetchPromise,
    handleReservationPromise,
  ]);

  const initialDisplayName =
    existingProfile?.displayName || clerkIdentity.displayName || '';

  const providedHandle =
    resolvedSearchParams?.handle ||
    pendingClaim?.username ||
    existingProfile?.username ||
    spotifySuggestedHandle;

  // Discard the early reservation if a providedHandle is now available (e.g. from
  // existingProfile.username) — otherwise isReservedHandle would incorrectly be true.
  let reservedHandle = !providedHandle ? earlyReservedHandle : null;
  if (
    !providedHandle &&
    !reservedHandle &&
    initialDisplayName !== earlyDisplayName
  ) {
    reservedHandle = await reserveOnboardingHandle(initialDisplayName);
  }

  const initialHandle = providedHandle || reservedHandle || '';

  const shouldAutoSubmitHandle =
    Boolean(spotifySuggestedHandle) &&
    !resolvedSearchParams?.handle &&
    !existingProfile?.username;

  return (
    <OnboardingFormWrapper
      initialDisplayName={initialDisplayName}
      initialHandle={initialHandle}
      isReservedHandle={Boolean(reservedHandle)}
      userEmail={userEmail}
      userId={userId}
      shouldAutoSubmitHandle={shouldAutoSubmitHandle}
      initialProfileId={existingProfile?.id ?? authResult.profileId}
      initialResumeStep={resolvedSearchParams?.resume ?? null}
      existingAvatarUrl={existingProfile?.avatarUrl ?? null}
      existingBio={existingProfile?.bio ?? null}
      existingGenres={existingProfile?.genres ?? null}
    />
  );
}

function reportMissingClerkUserId(authResult: {
  state: CanonicalUserState;
  dbUserId: string | null;
}) {
  const isClerkBypassed =
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    !publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!isClerkBypassed) {
    Sentry.captureMessage('Missing clerkUserId despite proxy routing', {
      level: 'warning',
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
}
