import { redirect } from 'next/navigation';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { APP_ROUTES } from '@/constants/routes';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';

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
  const authResult = await resolveUserState();

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

  // Authenticated visitors in WAITLIST_PENDING, NEEDS_WAITLIST_SUBMISSION,
  // NEEDS_DB_USER, or any future state render the confirmation view in
  // place. Redirecting them back to /start would loop through the proxy's
  // needsWaitlist rewrite.
  return <WaitlistSuccessView />;
}
