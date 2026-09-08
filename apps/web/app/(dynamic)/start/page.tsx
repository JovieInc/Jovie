import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingShell } from '@/components/features/onboarding/OnboardingShell';
import { getStartRouteRedirect } from '@/lib/auth/access-route-redirect';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';
import {
  type AuthGateResult,
  getWaitlistAccess,
  resolveUserState,
} from '@/lib/auth/gate';
import { resolveStartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
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

  const email = authResult.context.email;
  if (!email) return null;

  const access = await getWaitlistAccess(email);
  if (!access.entryId || !isWaitlistPendingStatus(access.status)) {
    return null;
  }

  return getStartRouteRedirect(authResult.state);
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

  const authResult = await resolveUserState({ createDbUserIfMissing: false });
  const startRedirect = await resolveStartPageRedirect(authResult);
  if (startRedirect) {
    redirect(startRedirect);
  }

  return (
    <OnboardingShell
      intentId={intentId}
      sessionLabel='pending'
      starterHandoff={starterHandoff}
    />
  );
}
