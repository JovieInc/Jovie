import { redirect } from 'next/navigation';
import { LazyEnhancedDashboardLinks } from '@/components/dashboard/organisms/LazyEnhancedDashboardLinks';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
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
    throwIfRedirect(error);
    console.error('Error loading profile:', error);

    return (
      <PageErrorState message='Failed to load profile data. Please refresh the page.' />
    );
  }
}
