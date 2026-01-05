import { redirect } from 'next/navigation';
import { resolveUserState, UserState } from '@/lib/auth/gate';

export const runtime = 'nodejs';

/**
 * Waitlist layout - uses centralized auth gate for access control.
 *
 * Allows access for:
 * - NEEDS_WAITLIST_SUBMISSION: User needs to submit waitlist application
 * - WAITLIST_PENDING: User has submitted but not yet approved
 *
 * Redirects for:
 * - UNAUTHENTICATED: To signin
 * - WAITLIST_INVITED: To claim page
 * - ACTIVE/NEEDS_ONBOARDING: To dashboard or onboarding
 * - BANNED: To banned page
 */
export default async function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  // States that should access waitlist page
  const canAccessWaitlist =
    authResult.state === UserState.NEEDS_WAITLIST_SUBMISSION ||
    authResult.state === UserState.WAITLIST_PENDING;

  if (canAccessWaitlist) {
    return children;
  }

  // Handle redirects for other states
  if (authResult.state === UserState.UNAUTHENTICATED) {
    redirect('/signin?redirect_url=/waitlist');
  }

  if (
    authResult.state === UserState.WAITLIST_INVITED &&
    authResult.redirectTo
  ) {
    redirect(authResult.redirectTo);
  }

  if (authResult.state === UserState.ACTIVE) {
    redirect('/app/dashboard');
  }

  if (authResult.state === UserState.NEEDS_ONBOARDING) {
    redirect('/onboarding?fresh_signup=true');
  }

  if (authResult.state === UserState.BANNED) {
    redirect('/banned');
  }

  // Fallback: use redirectTo if available, otherwise dashboard
  if (authResult.redirectTo) {
    redirect(authResult.redirectTo);
  }

  redirect('/app/dashboard');
}
