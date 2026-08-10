import { redirect } from 'next/navigation';
import { WaitlistIntakeChat } from '@/components/features/waitlist/WaitlistIntakeChat';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { APP_ROUTES } from '@/constants/routes';
import {
  CanonicalUserState,
  getWaitlistAccess,
  resolveUserState,
} from '@/lib/auth/gate';
import { isWaitlistPendingStatus } from '@/lib/waitlist/state-machine';

/**
 * Legacy /waitlist route.
 *
 * Anonymous visitors funnel into /start (the new front door, JOV-2132).
 * Authenticated visitors stay here and see the appropriate confirmation
 * view — they must NEVER bounce back to /start, because the proxy can
 * rewrite /start to /waitlist for needs-waitlist users and create a
 * server-side redirect loop (JOV-2161).
 */
export default async function WaitlistPage() {
  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  if (authResult.state === CanonicalUserState.BANNED) {
    redirect(APP_ROUTES.UNAVAILABLE);
  }
  if (authResult.state === CanonicalUserState.USER_CREATION_FAILED) {
    redirect('/error/user-creation-failed');
  }
  if (authResult.state === CanonicalUserState.ACTIVE) {
    redirect(APP_ROUTES.DASHBOARD);
  }
  if (authResult.state === CanonicalUserState.NEEDS_ONBOARDING) {
    redirect(APP_ROUTES.START);
  }

  // Anonymous visitors get the new front-door chat.
  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    redirect(APP_ROUTES.START);
  }

  // Resolve the entry directly even when the canonical auth state is briefly
  // stale after signup. A real pending row is the only success condition;
  // missing-user/submission states without that row fail closed below.
  const access = authResult.context.email
    ? await getWaitlistAccess(authResult.context.email)
    : null;
  if (access?.entryId && isWaitlistPendingStatus(access.status)) {
    return <WaitlistSuccessView email={authResult.context.email} />;
  }

  // Redirecting these authenticated states to /start can loop through the
  // proxy waitlist rewrite. Keep them here on the existing retryable intake;
  // this surface renders success only after its own API receipt.
  return <WaitlistIntakeChat userEmail={authResult.context.email} />;
}
