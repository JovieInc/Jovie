import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { PreviewDataHydrator } from '@/components/dashboard/organisms/PreviewDataHydrator';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getDashboardData,
  getProfileSocialLinks,
} from '../../dashboard/actions';
import { ProfilePreviewOpener } from '../../dashboard/profile/ProfilePreviewOpener';

export const runtime = 'nodejs';

export default async function SettingsArtistProfilePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/artist-profile');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  const profileId = dashboardData.selectedProfile?.id;
  const initialLinks = profileId ? await getProfileSocialLinks(profileId) : [];

  return (
    <>
      <ProfilePreviewOpener />
      <PreviewDataHydrator initialLinks={initialLinks} />
      <DashboardSettings focusSection='artist-profile' />
    </>
  );
}
