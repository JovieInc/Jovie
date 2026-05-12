import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';

/**
 * Legacy /waitlist route — redirects to /start (the anonymous onboarding
 * chat, JOV-2132). Authenticated-state redirects are preserved so users who
 * already have a profile / are in onboarding don't bounce through the
 * pre-account chat.
 *
 * The WaitlistIntakeChat / WaitlistSuccessView components stay on disk per
 * the JOV-2132 plan — they're the deterministic fallback. PR 4's cleanup
 * commit removes them once /start has 48 hours of clean metrics.
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
    redirect(APP_ROUTES.ONBOARDING);
  }

  // UNAUTHENTICATED, WAITLIST_PENDING, and any default state all funnel into
  // the new anonymous onboarding chat.
  redirect(APP_ROUTES.START);
}
