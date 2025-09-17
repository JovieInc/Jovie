import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { EnhancedDashboardLinks } from '@/components/dashboard/organisms/EnhancedDashboardLinks';
import { getDashboardData, getProfileSocialLinks } from '../actions';

export default async function LinksPage() {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/dashboard/links');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Fetch initial links for the selected profile on the server
    const profileId = dashboardData.selectedProfile?.id;
    const initialLinks = profileId
      ? await getProfileSocialLinks(profileId)
      : [];

    // Pass server-fetched data to enhanced client component
    return (
      <EnhancedDashboardLinks
        initialData={dashboardData}
        initialLinks={initialLinks}
      />
    );
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading links:', error);

    // On actual error, show a simple error message
    return (
      <div className='text-center'>
        <h1 className='text-2xl font-semibold text-primary-token mb-4'>
          Something went wrong
        </h1>
        <p className='text-secondary-token mb-4'>
          Failed to load links data. Please refresh the page.
        </p>
      </div>
    );
  }
}
