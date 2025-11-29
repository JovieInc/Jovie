import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/app/dashboard/actions';
import { OnboardingFormWrapper } from '@/components/dashboard/organisms/OnboardingFormWrapper';
import { ThemeToggle } from '@/components/site/ThemeToggle';

interface OnboardingPageProps {
  searchParams?: { handle?: string };
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const { userId } = await auth();
  if (!userId) {
    // Require auth for onboarding; preserve destination
    redirect('/sign-in?redirect_url=/onboarding');
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
    searchParams?.handle || existingProfile?.username || user?.username || '';

  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? null;

  return (
    <div className='min-h-screen bg-[var(--bg)] transition-colors'>
      {/* Theme Toggle */}
      <div className='absolute top-4 right-4 z-20'>
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
  );
}
