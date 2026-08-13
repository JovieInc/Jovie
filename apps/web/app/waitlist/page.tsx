import { notFound, redirect } from 'next/navigation';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { getWaitlistRouteRedirect } from '@/lib/auth/access-route-redirect';
import { getWaitlistAccess, resolveUserState } from '@/lib/auth/gate';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

/**
 * /waitlist is a durable pending receipt only (JOV-5001 / JOV-2132).
 *
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
  const authResult = await resolveUserState({ createDbUserIfMissing: false });
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
