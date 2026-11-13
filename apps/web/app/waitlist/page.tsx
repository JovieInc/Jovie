import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { WaitlistPublicLanding } from '@/components/features/waitlist/WaitlistPublicLanding';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { MarketingPageContractMarkers } from '@/components/site/MarketingPageContractMarkers';
import { APP_ROUTES } from '@/constants/routes';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  getWaitlistAccess,
  getWaitlistReservedHandle,
  resolveUserState,
} from '@/lib/auth/gate';
import { isPublicSignupClosed } from '@/lib/waitlist/public-signup-gate';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

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
 * /waitlist is the waitlist-first public handoff (JOV-5376) and the durable
 * pending receipt (JOV-5001 / JOV-2132).
 *
 * Unauthenticated visitors get splash-B sign-up. Pre-receipt authenticated
 * states recover to /start chat. They must not render the retired
 * seven-field waitlist questionnaire.
 *
 * WAITLIST_PENDING stays here. A real pending row is the only success
 * condition; missing receipts show a recoverable error rather than sending
 * the user back through the /signup redirect loop (JOV-6533).
 *
 * /start is rewrite-exempt for waitlist users, so recovering to /start does
 * not re-enter the JOV-2161 proxy rewrite loop.
 */
export default async function WaitlistPage() {
  // The public route-health runtime intentionally has no database but enables
  // the local E2E auth bypass for other suites. Keep that synthetic actor from
  // turning this anonymous surface into an authenticated /start redirect.
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') {
    // Prod parity for the no-database visual runtime (one front door, Tim,
    // 2026-11-09): an anonymous visitor with open signup gets the same /start
    // redirect prod serves, so CI captures and prod ship one journey.
    // Anonymous resolution is DB-free (the gate returns before any read); a
    // failed resolve — the E2E auth-bypass actor against the noop capture
    // database — keeps the landing, so the bypass still cannot turn this
    // surface into an authenticated /start redirect.
    const smokeAuth = await resolveUserState({
      createDbUserIfMissing: false,
    }).catch(() => null);
    if (
      smokeAuth?.state === CanonicalUserState.UNAUTHENTICATED &&
      !isPublicSignupClosed()
    ) {
      redirect(APP_ROUTES.START);
    }
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding signupClosed={isPublicSignupClosed()} />
      </WaitlistRouteWithContract>
    );
  }

  const authResult = await resolveUserState({ createDbUserIfMissing: false });
  const waitlistRedirect = getWaitlistRouteRedirect(authResult.state);
  if (waitlistRedirect) {
    redirect(waitlistRedirect);
  }

  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    // One front door (Tim, 2026-11-09): with signup open, an anonymous
    // visitor lands in the /start chat instead of the waitlist shell. The
    // signed-in pending receipt below is untouched.
    if (!isPublicSignupClosed()) {
      redirect(APP_ROUTES.START);
    }
    return (
      <WaitlistRouteWithContract>
        <WaitlistPublicLanding signupClosed={isPublicSignupClosed()} />
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
    const reservedHandle = await getWaitlistReservedHandle(access.entryId);
    return (
      <WaitlistRouteWithContract>
        <WaitlistSuccessView
          email={authResult.context.email}
          reservedHandle={reservedHandle}
        />
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
