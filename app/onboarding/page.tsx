import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/dashboard/actions';
import { AuthLayout } from '@/components/auth';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import { ThemeToggle } from '@/components/site/ThemeToggle';

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

  const dashboardData = await getDashboardData();
  if (!dashboardData.needsOnboarding) {
    redirect('/dashboard/overview');
  }

  const existingProfile = dashboardData.selectedProfile;
  const user = await currentUser();

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

  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? null;

  return (
    <AuthLayout
      brandingTitle='Finish setting up your Jovie profile'
      brandingDescription='Choose your name and Jovie handle so your profile is ready to share.'
      formTitle='Pick your @handle'
      gradientFrom='purple-600'
      gradientVia='cyan-600'
      gradientTo='blue-600'
      textColorClass='text-purple-100'
      brandingShowText={false}
    >
      <div className='relative min-h-[500px]'>
        {/* Theme Toggle pinned to viewport */}
        <div className='fixed top-4 right-4 z-40'>
          <ThemeToggle />
        </div>

        {/* Unified onboarding form */}
        <OnboardingFormWrapper
          initialDisplayName={initialDisplayName}
          initialHandle={initialHandle}
          userEmail={userEmail}
          userId={userId}
        />
      </div>
    </AuthLayout>
  );
}
