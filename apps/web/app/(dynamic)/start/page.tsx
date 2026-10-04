import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';
import { getStartRouteRedirect } from '@/lib/auth/access-route-redirect';
import { auth } from '@/lib/auth/better-auth';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';
import {
  type AuthGateResult,
  getWaitlistAccess,
  resolveUserState,
} from '@/lib/auth/gate';
import { captureWarning } from '@/lib/error-tracking';
import { resolveStartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import { resolveStartEntryProfile } from '@/lib/onboarding/start-entry-profile.server';
import { resolveSyntheticPassage } from '@/lib/synthetic/passage.server';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

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
  description: 'Start your artist profile in one conversation.',
  robots: { index: false, follow: false },
};

async function resolveStartPageRedirect(
  authResult: AuthGateResult
): Promise<string | null> {
  if (authResult.state !== CanonicalUserState.WAITLIST_PENDING) {
    return getStartRouteRedirect(authResult.state);
  }

  // JOV-6449: with the launch gate off, waitlist table reads are irrelevant
  // and must not 500 /start. Canonical WAITLIST_PENDING still goes to the
  // receipt so already-waitlisted accounts stay gated.
  // JOV-5225: the gate check and entry lookup are advisory refinement on top
  // of the canonical state — if either read fails, fall back to the canonical
  // redirect instead of 500-ing the signup golden path.
  try {
    const waitlistGateEnabled = await isWaitlistGateEnabled();
    if (!waitlistGateEnabled) {
      return getStartRouteRedirect(authResult.state);
    }

    const email = authResult.context.email;
    if (!email) return null;

    const access = await getWaitlistAccess(email);
    if (!access.entryId || !isWaitlistPendingStatus(access.status)) {
      return null;
    }
  } catch (error) {
    await captureWarning(
      '[start] waitlist gate/entry read failed; falling back to canonical redirect',
      error,
      { operation: 'resolveStartPageRedirect' }
    );
  }

  return getStartRouteRedirect(authResult.state);
}

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

  // JOV-7753: a handle-only entry (outreach, claim redirect) shows the
  // visitor's real page first. Explicit prompts and intents keep their flow.
  const [authResult, entryProfile] = await Promise.all([
    resolveUserState({ createDbUserIfMissing: false }),
    starterHandoff || intentId
      ? Promise.resolve(null)
      : resolveStartEntryProfile(params),
  ]);
  const startRedirect = await resolveStartPageRedirect(authResult);
  if (startRedirect) {
    redirect(startRedirect);
  }

  const isSignedIn = authResult.state !== CanonicalUserState.UNAUTHENTICATED;
  const turnstileTestMode = await resolveSyntheticTurnstileTestMode(isSignedIn);

  return (
    <OnboardingShell
      isSignedIn={isSignedIn}
      turnstileTestMode={turnstileTestMode}
      intentId={intentId}
      sessionLabel='pending'
      starterHandoff={starterHandoff}
      entryProfile={entryProfile}
    />
  );
}
