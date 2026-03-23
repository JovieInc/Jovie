import { PreviewDataHydrator } from '@/features/dashboard/organisms/PreviewDataHydrator';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import {
  getDashboardData,
  getProfileSocialLinks,
} from '../../dashboard/actions';
import { ProfilePreviewOpener } from '../../dashboard/profile/ProfilePreviewOpener';
import { ArtistProfileContent } from './ArtistProfileContent';

export const runtime = 'nodejs';

export default async function SettingsArtistProfilePage() {
  const dashboardData = await getDashboardData();
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
      <ArtistProfileContent />
    </>
  );
}
