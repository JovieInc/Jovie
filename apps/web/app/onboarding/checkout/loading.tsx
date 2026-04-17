import { AuthPageSkeleton } from '@/features/auth';

/**
 * Loading skeleton for the onboarding checkout page.
 * Uses AuthLayout-compatible skeleton since the page wraps in AuthLayout.
 */
export default function OnboardingCheckoutLoading() {
  return (
    <AuthPageSkeleton formTitle='Upgrade your profile' showFormTitle={false} />
  );
}
