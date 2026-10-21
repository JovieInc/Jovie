import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingSessionBoundary } from '@/components/features/onboarding/OnboardingSessionBoundary';
import { APP_ROUTES } from '@/constants/routes';
import { getStartRouteRedirect } from '@/lib/auth/access-route-redirect';
import { auth } from '@/lib/auth/better-auth';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';
import { resolveUserState } from '@/lib/auth/gate';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { db } from '@/lib/db';
import { captureWarning } from '@/lib/error-tracking';
import { resolveStartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import { readStartEntryHandle } from '@/lib/onboarding/start-entry-profile';
import { resolveStartEntryProfile } from '@/lib/onboarding/start-entry-profile.server';
import { resolveSyntheticPassage } from '@/lib/synthetic/passage.server';

/**
 * Canonical onboarding chat entry point.
 *
 * The page is intentionally read-only. `/api/chat` mints the signed
 * `jovie_onboarding_session` cookie on the visitor's first onboarding
 * message, because cookies can only be modified from a route handler or
 * server action.
 *
 * Placed under `app/(dynamic)/` so the marketing-static rule does not apply
 * — this route dispatches a streaming LLM response through `/api/chat`. CSP
 * nonce and middleware behavior follow the existing dynamic-group conventions.
 *
 * The visual shell here is intentionally minimal for v1. Cinematic reveal
 * choreography (per the JOV-2132 plan + Stanley refs) lands incrementally
 * after the first round of real-artist watch sessions.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Start with Jovie',
  // JOV-7794: no unmeasured speed claim, no single-ICP wording.
  description: 'Claim your name and start your Jovie profile.',
  robots: { index: false, follow: false },
};

/**
 * Approved synthetic principals (JOV-7697) get Cloudflare's test sitekey so
 * the widget mints the dummy token that `/api/chat` verifies in test mode.
 * The server decides passage again on every chat request; this only picks
 * which widget renders. Anonymous visitors never trigger a session read.
 */
async function resolveSyntheticTurnstileTestMode(
  isSignedIn: boolean
): Promise<boolean> {
  if (!isSignedIn) return false;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return (await resolveSyntheticPassage(session, 'onboarding_chat')) !== null;
  } catch (error) {
    await captureWarning(
      '[start] synthetic passage check failed; using the production sitekey',
      error,
      { operation: 'resolveSyntheticTurnstileTestMode' }
    );
    return false;
  }
}

export default async function StartPage(
  {
    searchParams,
  }: Readonly<{
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }> = { searchParams: Promise.resolve({}) }
) {
  const params = await searchParams;
  const intentId =
    typeof params.intent_id === 'string' ? params.intent_id : undefined;
  const starterHandoff = resolveStartEntryHandoff(params);

  // A handoff does not replace known public identity/catalog context.
  const [authResult, entryProfile] = await Promise.all([
    resolveUserState({ createDbUserIfMissing: false }),
    resolveStartEntryProfile(params),
  ]);
  const startRedirect = getStartRouteRedirect(authResult.state, {
    hasEntryIntent: Boolean(
      readStartEntryHandle(params) ||
        starterHandoff ||
        intentId ||
        params.resume === '1'
    ),
  });
  if (startRedirect) {
    redirect(startRedirect);
  }

  // Consume an own-profile intent only for the current authorized workspace.
  // Other targets require an explicit account/profile choice.
  const targetProfileId =
    entryProfile && 'profileId' in entryProfile ? entryProfile.profileId : null;
  if (
    authResult.state === CanonicalUserState.ACTIVE &&
    authResult.dbUserId &&
    targetProfileId === authResult.profileId &&
    targetProfileId
  ) {
    const access = await getExactProfileAccess(
      db,
      authResult.dbUserId,
      targetProfileId
    );
    if (access.ok) redirect(APP_ROUTES.DASHBOARD);
  }
  const accountClaimHandle =
    authResult.state === CanonicalUserState.ACTIVE
      ? readStartEntryHandle(params)
      : null;

  const isSignedIn = authResult.state !== CanonicalUserState.UNAUTHENTICATED;
  const turnstileTestMode = await resolveSyntheticTurnstileTestMode(isSignedIn);

  return (
    <OnboardingSessionBoundary
      isSignedIn={isSignedIn}
      turnstileTestMode={turnstileTestMode}
      intentId={intentId}
      sessionLabel='pending'
      starterHandoff={starterHandoff}
      entryProfile={entryProfile}
      accountClaimHandle={accountClaimHandle ?? undefined}
      accountIdentityId={authResult.clerkUserId ?? undefined}
    />
  );
}
