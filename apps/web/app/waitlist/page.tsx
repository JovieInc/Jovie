import { redirect } from 'next/navigation';
import { WaitlistIntakeChat } from '@/components/features/waitlist/WaitlistIntakeChat';
import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';
import { APP_ROUTES } from '@/constants/routes';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';

export default async function WaitlistPage() {
  const authResult = await resolveUserState();

  if (authResult.state === CanonicalUserState.UNAUTHENTICATED) {
    redirect(`${APP_ROUTES.SIGNUP}?redirect_url=${APP_ROUTES.WAITLIST}`);
  }

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

  if (authResult.state === CanonicalUserState.WAITLIST_PENDING) {
    return <WaitlistSuccessView />;
  }

  return <WaitlistIntakeChat userEmail={authResult.context.email} />;
}
