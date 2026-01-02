import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/dashboard/actions';
import { AuthLayout } from '@/components/auth';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import {
  canAccessOnboarding,
  resolveUserState,
  UserState,
} from '@/lib/auth/gate';

interface OnboardingPageProps {
  searchParams?: Promise<{ handle?: string }>;
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const resolvedSearchParams = await searchParams;

  // Use centralized auth gate for access control
  const authResult = await resolveUserState();

  // Handle unauthenticated users - preserve handle param in redirect
  if (authResult.state === UserState.UNAUTHENTICATED) {
    const handleParam = resolvedSearchParams?.handle
      ? `?handle=${encodeURIComponent(resolvedSearchParams.handle)}`
      : '';
    const redirectTarget = `/onboarding${handleParam}`;
    redirect(`/signin?redirect_url=${encodeURIComponent(redirectTarget)}`);
  }

  // Handle states that can't access onboarding - use centralized redirectTo
  if (!canAccessOnboarding(authResult.state)) {
    if (authResult.redirectTo) {
      redirect(authResult.redirectTo);
    }
    // Fallback (should never reach here)
    redirect('/app/dashboard/overview');
  }

  const user = await currentUser();
  const userEmail =
    authResult.context.email ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const userId = authResult.clerkUserId!;

  // Get dashboard data for form initialization
  // No need to check needsOnboarding here - auth gate already validated access
  // Removing this check prevents redirect loops caused by race conditions
  const dashboardData = await getDashboardData();
  const existingProfile = dashboardData.selectedProfile;

  const displayNameSource = existingProfile?.displayName
    ? 'profile'
    : user?.fullName
      ? 'clerk_full_name'
      : null;

  const initialDisplayName =
    existingProfile?.displayName ||
    user?.fullName ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    '';

  const initialHandle =
    resolvedSearchParams?.handle ||
    existingProfile?.username ||
    user?.username ||
    '';

  const skipNameStep =
    displayNameSource === 'profile' || displayNameSource === 'clerk_full_name';

  return (
    <AuthLayout
      formTitle="What's your name?"
      showFooterPrompt={false}
      showFormTitle={false}
      logoSpinDelayMs={10000}
      showLogoutButton
      logoutRedirectUrl='/signin'
    >
      <div className='relative min-h-[500px]'>
        {/* Unified onboarding form */}
        <OnboardingFormWrapper
          initialDisplayName={initialDisplayName}
          initialHandle={initialHandle}
          userEmail={userEmail}
          userId={userId}
          skipNameStep={skipNameStep}
        />
      </div>
    </AuthLayout>
  );
}
