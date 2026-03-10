import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { PreviewDataHydrator } from '@/components/dashboard/organisms/PreviewDataHydrator';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import {
  getDashboardData,
  getProfileSocialLinks,
} from '../../dashboard/actions';
import { ProfilePreviewOpener } from '../../dashboard/profile/ProfilePreviewOpener';

export const runtime = 'nodejs';

export default async function SettingsArtistProfilePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings/artist-profile`);
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  const profileId = dashboardData.selectedProfile?.id;
  const initialLinks = profileId
    ? await getProfileSocialLinks(profileId).catch(() => [])
    : [];

  const connectedDSPs = dashboardData.selectedProfile
    ? getCanonicalProfileDSPs(dashboardData.selectedProfile, initialLinks)
    : [];

  return (
    <>
      <ProfilePreviewOpener />
      <PreviewDataHydrator
        initialLinks={initialLinks}
        connectedDSPs={connectedDSPs}
      />
      <DashboardSettings focusSection='artist-profile' />
    </>
  );
}
