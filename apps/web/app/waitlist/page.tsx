import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { WaitlistPublicLanding } from '@/components/features/waitlist/WaitlistPublicLanding';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  getWaitlistAccess,
  resolveRequestAuthIdentity,
  resolveUserState,
} from '@/lib/auth/gate';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

function canUseE2ETestAuthFallback(): boolean {
  return (
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
    process.env.NEXT_PUBLIC_E2E_MODE === '1' &&
    process.env.VERCEL_ENV !== 'preview'
  );
}

function WaitlistRouteWithContract({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <MarketingPageContractMarkers />
      {children}
    </>
  );
}

/**
 * /waitlist is the waitlist-first public handoff (JOV-5334 / JOV-5376) and the
 * durable pending receipt (JOV-5001 / JOV-2132).
 *
 * Unauthenticated visitors get splash-B sign-up. Pre-receipt authenticated
 * states recover to /start chat. They must not render the retired
 * seven-field waitlist questionnaire.
 *
 * WAITLIST_PENDING stays here. A real pending row is the only success
 * condition; missing receipts recover to /signup instead of 404ing
 * acquisition traffic (JOV-6436).
 *
 * /start is rewrite-exempt for waitlist users, so recovering to /start does
 * not re-enter the JOV-2161 proxy rewrite loop.
 */
export default async function WaitlistPage() {
  // The public route-health runtime intentionally has no database but enables
  // the local E2E auth bypass for other suites. Keep that synthetic actor from
  // turning this anonymous surface into an authenticated /start redirect.
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') {
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding />
      </WaitlistRouteWithContract>
    );
  }

  const identity = await resolveRequestAuthIdentity();
  if (!identity.clerkUserId && !canUseE2ETestAuthFallback()) {
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding />
      </WaitlistRouteWithContract>
    );
  }

  const authResult = await resolveUserState({
    createDbUserIfMissing: false,
    ...(identity.clerkUserId ? { knownAuthIdentity: identity } : {}),
  });
  const waitlistRedirect = getWaitlistRouteRedirect(authResult.state);
  if (waitlistRedirect) {
    redirect(waitlistRedirect);
  }

  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding />
      </WaitlistRouteWithContract>
    );
  }

  // JOV-6449: gate-off post-auth must not depend on a waitlist table read.
  // Canonical WAITLIST_PENDING is enough to render the receipt.
  const waitlistGateEnabled = await isWaitlistGateEnabled();
  if (
    authResult.state === CanonicalUserState.WAITLIST_PENDING &&
    !waitlistGateEnabled
  ) {
    return (
      <WaitlistRouteWithContract>
        <WaitlistSuccessView email={authResult.context.email} />
      </WaitlistRouteWithContract>
    );
  }

  const access = authResult.context.email
    ? await getWaitlistAccess(authResult.context.email)
    : null;
  if (access?.entryId && isWaitlistPendingStatus(access.status)) {
    return (
      <WaitlistRouteWithContract>
        <WaitlistSuccessView email={authResult.context.email} />
      </WaitlistRouteWithContract>
    );
  }

  // A stale pending status must not claim success or bounce a signed-in user
  // through /signup -> /waitlist indefinitely.
  return (
    <WaitlistRouteWithContract>
      <WaitlistSuccessView
        outcome='receipt_unavailable'
        email={authResult.context.email}
      />
    </WaitlistRouteWithContract>
  );
}
