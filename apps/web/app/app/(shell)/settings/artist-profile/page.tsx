import { APP_ROUTES } from '@/constants/routes';
import { PreviewDataHydrator } from '@/features/dashboard/organisms/PreviewDataHydrator';
import { listArtistRulesForProfile } from '@/lib/artist-rules/store';
import type { ArtistRuleView } from '@/lib/artist-rules/types';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { getProfileSocialLinks } from '../../dashboard/actions';
import { ProfilePreviewOpener } from '../../dashboard/profile/ProfilePreviewOpener';
import { ArtistProfileContent } from './ArtistProfileContent';

export const runtime = 'nodejs';

export default async function SettingsArtistProfilePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly rules?: string }>;
}) {
  const params = await searchParams;
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings artist profile page',
    dashboardErrorMessage:
      'Failed to load artist profile settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const dashboardData = routeContext.dashboardData;
  const profileId = dashboardData.selectedProfile?.id;
  const initialLinks = profileId
    ? await getProfileSocialLinks(profileId).catch(() => [])
    : [];
  const initialArtistRules: readonly ArtistRuleView[] = profileId
    ? await listArtistRulesForProfile(profileId).catch(() => [])
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
      <ArtistProfileContent
        creatorProfileId={profileId ?? 'unavailable'}
        initialArtistRules={initialArtistRules}
        defaultRulesOpen={params.rules === '1'}
      />
    </>
  );
}
