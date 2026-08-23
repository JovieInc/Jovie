import { notFound, redirect } from 'next/navigation';
import { WaitlistEntryView } from '@/components/features/waitlist/WaitlistEntryView';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import {
  CanonicalUserState,
  getWaitlistAccess,
  resolveUserState,
} from '@/lib/auth/gate';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

/**
 * /waitlist is the public waitlist entry and durable pending receipt.
 *
 * Signed-out visitors start auth here instead of bouncing through /start.
 * Pre-receipt authenticated states (verified auth with no app user, or no
 * waitlist row yet) recover to /start chat. They must not render the retired
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
    return <WaitlistEntryView />;
  }

  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    return <WaitlistEntryView />;
  }

  const waitlistRedirect = getWaitlistRouteRedirect(authResult.state);
  if (waitlistRedirect) {
    redirect(waitlistRedirect);
  }

  const access = authResult.context.email
    ? await getWaitlistAccess(authResult.context.email)
    : null;
  if (access?.entryId && isWaitlistPendingStatus(access.status)) {
    return <WaitlistSuccessView email={authResult.context.email} />;
  }

  notFound();
}
