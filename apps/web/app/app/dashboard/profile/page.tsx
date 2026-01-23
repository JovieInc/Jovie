import { redirect } from 'next/navigation';
import { LazyEnhancedDashboardLinks } from '@/components/dashboard/organisms/LazyEnhancedDashboardLinks';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardDataCached, getProfileSocialLinks } from '../actions';

// Revalidate every minute for settings data
export const revalidate = 60;

export default async function ProfilePage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/profile');
  }

  try {
    // Fetch dashboard data server-side (cached per request)
    const dashboardData = await getDashboardDataCached();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Fetch initial links for the selected profile on the server
    const profileId = dashboardData.selectedProfile?.id;
    const initialLinks = profileId
      ? await getProfileSocialLinks(profileId)
      : [];

    // Pass server-fetched data to lazy-loaded client component
    return <LazyEnhancedDashboardLinks initialLinks={initialLinks} />;
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading profile:', error);

    // On actual error, show a simple error message
    return (
      <div className='flex items-center justify-center'>
        <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
          <h1 className='mb-3 text-2xl font-semibold text-primary-token'>
            Something went wrong
          </h1>
          <p className='mb-4 text-secondary-token'>
            Failed to load profile data. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }
}
