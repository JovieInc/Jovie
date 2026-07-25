import { redirect } from 'next/navigation';
import { OpportunityInboxPageClient } from '@/components/features/opportunity-inbox/OpportunityInboxPageClient';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { loadOpportunityInboxData } from '@/lib/connectors/opportunity-inbox-data';
import type { AvailableDSP } from '@/lib/dsp';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { logger } from '@/lib/utils/logger';
import { loadAuthenticatedAppShellUserId } from './app-shell-route-context';
import {
  getDashboardShellData,
  getProfileSocialLinks,
  type ProfileSocialLink,
} from './dashboard/actions';

/**
 * Resolve the selected profile plus the data needed to hydrate the profile
 * rail. Fail-soft: the inbox must still render suggested-action cards when
 * dashboard shell data is unavailable.
 */
async function resolveProfileRailData(clerkUserId: string): Promise<{
  readonly connectedDSPs: readonly AvailableDSP[];
  readonly initialLinks: readonly ProfileSocialLink[];
  readonly profileId: string | null;
}> {
  try {
    const dashboardData = await getDashboardShellData(clerkUserId);
    if (dashboardData.dashboardLoadError) {
      return { connectedDSPs: [], initialLinks: [], profileId: null };
    }
    const selectedProfile = dashboardData.selectedProfile;
    if (!selectedProfile) {
      return { connectedDSPs: [], initialLinks: [], profileId: null };
    }

    const initialLinks = await getProfileSocialLinks(selectedProfile.id).catch(
      () => []
    );
    return {
      connectedDSPs: getCanonicalProfileDSPs(selectedProfile, initialLinks),
      initialLinks,
      profileId: selectedProfile.id,
    };
  } catch (error) {
    logger.error(
      '[opportunity-inbox] profile rail data resolution failed; rendering inbox without profile data',
      error
    );
    return { connectedDSPs: [], initialLinks: [], profileId: null };
  }
}

export async function OpportunityInboxRoute() {
  const clerkUserId = await loadAuthenticatedAppShellUserId({
    route: APP_ROUTES.DASHBOARD,
  });
  const profileRailData = await resolveProfileRailData(clerkUserId);
  const inbox = await loadOpportunityInboxData(clerkUserId, {
    profileId: profileRailData.profileId,
  });

  if (!inbox) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.DASHBOARD));
  }

  return (
    <OpportunityInboxPageClient
      inbox={inbox}
      initialLinks={profileRailData.initialLinks}
      connectedDSPs={profileRailData.connectedDSPs}
    />
  );
}
