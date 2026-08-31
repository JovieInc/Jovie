import { notFound, redirect } from 'next/navigation';
import { WaitlistPublicLanding } from '@/components/features/waitlist/WaitlistPublicLanding';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  getWaitlistAccess,
  resolveRequestAuthIdentity,
  resolveUserState,
} from '@/lib/auth/gate';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

function canUseE2ETestAuthFallback(): boolean {
  return (
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
    process.env.NEXT_PUBLIC_E2E_MODE === '1' &&
    process.env.VERCEL_ENV !== 'preview'
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
 * condition; missing receipts fail closed without false confirmation.
 *
 * /start is rewrite-exempt for waitlist users, so recovering to /start does
 * not re-enter the JOV-2161 proxy rewrite loop.
 */
export default async function WaitlistPage() {
  // The public route-health runtime intentionally has no database but enables
  // the local E2E auth bypass for other suites. Keep that synthetic actor from
  // turning this anonymous surface into an authenticated /start redirect.
  if (process.env.PUBLIC_NOAUTH_SMOKE === '1') {
    return <WaitlistPublicLanding />;
  }

  const identity = await resolveRequestAuthIdentity();
  if (!identity.clerkUserId && !canUseE2ETestAuthFallback()) {
    return <WaitlistPublicLanding />;
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
    return <WaitlistPublicLanding />;
  }

  const access = authResult.context.email
    ? await getWaitlistAccess(authResult.context.email)
    : null;
  if (access?.entryId && isWaitlistPendingStatus(access.status)) {
    return <WaitlistSuccessView email={authResult.context.email} />;
  }

  notFound();
}
