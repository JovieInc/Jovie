import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/app/dashboard/actions';
import { AuthLayout } from '@/components/auth';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import { getWaitlistAccessByEmail } from '@/lib/waitlist/access';

interface OnboardingPageProps {
  searchParams?: Promise<{ handle?: string }>;
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const resolvedSearchParams = await searchParams;
  const { userId } = await auth();
  if (!userId) {
    // Require auth for onboarding; preserve destination including handle param
    const handleParam = resolvedSearchParams?.handle
      ? `?handle=${encodeURIComponent(resolvedSearchParams.handle)}`
      : '';
    const redirectTarget = `/onboarding${handleParam}`;
    redirect(`/signin?redirect_url=${encodeURIComponent(redirectTarget)}`);
  }

  const user = await currentUser();
  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? null;
  if (!userEmail) {
    redirect('/waitlist');
  }

  const access = await getWaitlistAccessByEmail(userEmail);
  if (
    !access.status ||
    access.status === 'new' ||
    access.status === 'rejected'
  ) {
    redirect('/waitlist');
  }

  if (access.status === 'invited') {
    if (access.inviteToken) {
      redirect(`/claim/${encodeURIComponent(access.inviteToken)}`);
    }
    redirect('/waitlist');
  }

  const dashboardData = await getDashboardData();
  if (!dashboardData.needsOnboarding) {
    redirect('/app/dashboard/overview');
  }

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
