import { redirect } from 'next/navigation';
import { PreviewDataHydrator } from '@/components/dashboard/organisms/PreviewDataHydrator';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData, getProfileSocialLinks } from '../actions';
import { ProfilePageChat } from './ProfilePageChat';
import { ProfilePreviewOpener } from './ProfilePreviewOpener';

export const runtime = 'nodejs';

export default async function ProfilePage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/profile');
  }

  try {
    // Fetch dashboard data server-side (cached per request)
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

    return (
      <>
        <ProfilePreviewOpener />
        <PreviewDataHydrator initialLinks={initialLinks} />
        <ProfilePageChat />
      </>
    );
  } catch (error) {
    throwIfRedirect(error);
    console.error('Error loading profile:', error);

    return (
      <PageErrorState message='Failed to load profile data. Please refresh the page.' />
    );
  }
}
