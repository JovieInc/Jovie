import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { IntentRestorer } from '@/components/onboarding/IntentRestorer';
import { APP_ROUTES } from '@/constants/routes';
import { OnboardingFormWrapper } from '@/features/dashboard/organisms/OnboardingFormWrapper';
import { getCachedCurrentUser } from '@/lib/auth/cached';
import { resolveClerkIdentity } from '@/lib/auth/clerk-identity';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { readPendingClaimContext } from '@/lib/claim/context';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isE2EFastOnboardingEnabled } from '@/lib/e2e/runtime';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { getAppFlagValue } from '@/lib/flags/server';
import {
  buildHandleCandidates,
  reserveOnboardingHandle,
} from '@/lib/onboarding/reserved-handle';
import { extractErrorMessage } from '@/lib/utils/errors';

interface OnboardingPageProps {
  readonly searchParams?: Promise<{
    readonly handle?: string;
    readonly username?: string;
    readonly resume?: string;
    readonly intent_id?: string;
  }>;
}

interface OnboardingBootstrapProfile {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly bio: string | null;
  readonly genres: string[] | null;
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
  const pendingClaim = await readPendingClaimContext();
  const targetProfileId = pendingClaim?.creatorProfileId ?? null;
  const handleQuery =
    resolvedSearchParams?.handle ?? resolvedSearchParams?.username;
  const shouldSkipDashboardPrefetch =
    isE2EFastOnboardingEnabled() && Boolean(handleQuery);
  const assumeInitialHandleAvailable =
    isE2EFastOnboardingEnabled() && Boolean(handleQuery);

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

  const hasResumeSignal = Boolean(resolvedSearchParams?.resume);
  const hasOnboardingContinuationSignal = Boolean(
    handleQuery || resolvedSearchParams?.resume
  );
  const shouldLoadExistingProfile = Boolean(
    targetProfileId ?? authResult.profileId
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
  const showOnboardingV1Design = await getAppFlagValue('DESIGN_V1', {
    userId,
  });
  // Run profile prefetch and handle reservation in parallel (they're independent)
  const spotifySuggestedHandle = clerkIdentity.spotifyUsername ?? '';

  const profilePrefetchPromise = createProfilePrefetchPromise();

  function createProfilePrefetchPromise() {
    if (shouldSkipDashboardPrefetch || !shouldLoadExistingProfile) {
      return Promise.resolve(null);
    }

    return getOnboardingBootstrapProfile(
      (targetProfileId ?? authResult.profileId)!
    ).catch((error: unknown) => {
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
  }

  // Start handle reservation early with what we know now (display name from Clerk)
  const earlyDisplayName = clerkIdentity.displayName || '';
  const earlyProvidedHandle =
    handleQuery || pendingClaim?.username || spotifySuggestedHandle;
  const reservedHandlePromise =
    !earlyProvidedHandle && earlyDisplayName
      ? reserveOnboardingHandle(earlyDisplayName)
          .then(handle => ({
            handle,
            isReserved: true,
          }))
          .catch(() => ({
            handle: buildHandleCandidates(earlyDisplayName)[0] ?? null,
            isReserved: false,
          }))
      : Promise.resolve<{
          handle: string | null;
          isReserved: boolean;
        }>({
          handle: null,
          isReserved: false,
        });

  const [existingProfile, earlyReservedHandle] = await Promise.all([
    profilePrefetchPromise,
    reservedHandlePromise,
  ]);

  const initialDisplayName =
    existingProfile?.displayName || clerkIdentity.displayName || '';

  const providedHandle =
    handleQuery ||
    pendingClaim?.username ||
    existingProfile?.username ||
    spotifySuggestedHandle;

  // Discard the early reservation if a providedHandle is now available (e.g. from
  // existingProfile.username) — otherwise isReservedHandle would incorrectly be true.
  let reservedHandle = providedHandle ? null : earlyReservedHandle.handle;
  let isReservedHandle = !providedHandle && earlyReservedHandle.isReserved;
  if (
    shouldLoadExistingProfile &&
    !providedHandle &&
    !hasResumeSignal &&
    !reservedHandle &&
    initialDisplayName !== earlyDisplayName
  ) {
    reservedHandle = buildHandleCandidates(initialDisplayName)[0] ?? null;
    isReservedHandle = false;
  }

  const initialHandle = providedHandle || reservedHandle || '';

  const shouldAutoSubmitHandle =
    Boolean(spotifySuggestedHandle) &&
    !handleQuery &&
    !existingProfile?.username;

  return (
    <>
      <IntentRestorer intentId={resolvedSearchParams?.intent_id} />
      <OnboardingFormWrapper
        assumeInitialHandleAvailable={assumeInitialHandleAvailable}
        initialDisplayName={initialDisplayName}
        initialHandle={initialHandle}
        isReservedHandle={isReservedHandle}
        userEmail={userEmail}
        userId={userId}
        shouldAutoSubmitHandle={shouldAutoSubmitHandle}
        initialProfileId={
          existingProfile?.id ?? targetProfileId ?? authResult.profileId
        }
        initialResumeStep={resolvedSearchParams?.resume ?? null}
        existingAvatarUrl={existingProfile?.avatarUrl ?? null}
        existingBio={existingProfile?.bio ?? null}
        existingGenres={existingProfile?.genres ?? null}
        designV1={showOnboardingV1Design}
      />
    </>
  );
}

async function getOnboardingBootstrapProfile(
  profileId: string
): Promise<OnboardingBootstrapProfile | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      bio: creatorProfiles.bio,
      genres: creatorProfiles.genres,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  return profile ?? null;
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
