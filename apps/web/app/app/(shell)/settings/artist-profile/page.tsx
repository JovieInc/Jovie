import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { PreviewDataHydrator } from '@/components/dashboard/organisms/PreviewDataHydrator';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getDashboardData,
  getProfileSocialLinks,
} from '../../dashboard/actions';
import { ProfilePreviewOpener } from '../../dashboard/profile/ProfilePreviewOpener';
import {
  checkAppleMusicConnection,
  checkSpotifyConnection,
} from '../../dashboard/releases/actions';

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

  const [spotifyResult, appleMusicResult] = await Promise.allSettled([
    checkSpotifyConnection(),
    checkAppleMusicConnection(),
  ]);

  const spotifyStatus =
    spotifyResult.status === 'fulfilled'
      ? spotifyResult.value
      : { connected: false, spotifyId: null, artistName: null };
  const appleMusicStatus =
    appleMusicResult.status === 'fulfilled'
      ? appleMusicResult.value
      : { connected: false, artistName: null, artistId: null };

  return (
    <>
      <ProfilePreviewOpener />
      <PreviewDataHydrator
        initialLinks={initialLinks}
        spotifyConnected={spotifyStatus.connected}
        spotifyArtistName={spotifyStatus.artistName}
        appleMusicConnected={appleMusicStatus.connected}
        appleMusicArtistName={appleMusicStatus.artistName}
      />
      <DashboardSettings focusSection='artist-profile' />
    </>
  );
}
