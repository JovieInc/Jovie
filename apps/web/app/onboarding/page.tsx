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
  searchParams?: Promise<{
    handle?: string;
    fresh_signup?: string;
  }>;
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const resolvedSearchParams = await searchParams;
  const isFreshSignup = resolvedSearchParams?.fresh_signup === 'true';

  // Loop detection: If we've been here before (no fresh_signup flag),
  // something went wrong. Log a warning for monitoring.
  if (!isFreshSignup) {
    console.warn(
      '[ONBOARDING] Detected potential redirect loop (missing fresh_signup flag)'
    );
  }

  // Use centralized auth gate for access control
  const authResult = await resolveUserState();

  // Handle unauthenticated users - preserve handle param in redirect
  if (authResult.state === UserState.UNAUTHENTICATED) {
    console.error('[ONBOARDING] Not authenticated on onboarding page');
    const handleParam = resolvedSearchParams?.handle
      ? `?handle=${encodeURIComponent(resolvedSearchParams.handle)}`
      : '';
    const redirectTarget = `/onboarding${handleParam}`;
    redirect(`/signin?redirect_url=${encodeURIComponent(redirectTarget)}`);
  }

  // If we couldn't get a DB user and this isn't a fresh signup,
  // we're likely in a loop - show error page instead of redirecting
  if (!authResult.dbUserId && !isFreshSignup) {
    console.error(
      '[ONBOARDING] Redirect loop detected: no DB user and not fresh signup'
    );
    return (
      <AuthLayout
        formTitle='Setup Error'
        showFooterPrompt={false}
        showFormTitle={true}
        logoSpinDelayMs={0}
        showLogoutButton
        logoutRedirectUrl='/signin'
      >
        <div className='flex min-h-[400px] items-center justify-center'>
          <div className='max-w-md text-center space-y-4'>
            <p className='text-muted-foreground'>
              We're having trouble setting up your account. Please try logging
              out and signing in again.
            </p>
            <a
              href='/signout'
              className='inline-block text-primary hover:underline font-medium'
            >
              Return to login
            </a>
          </div>
        </div>
      </AuthLayout>
    );
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
