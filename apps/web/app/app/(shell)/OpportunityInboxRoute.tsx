import { redirect } from 'next/navigation';
import { OpportunityInboxPageClient } from '@/components/features/opportunity-inbox/OpportunityInboxPageClient';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import {
  loadOpportunityInboxData,
  loadOpportunityInboxTourDateSections,
} from '@/lib/connectors/opportunity-inbox-data';
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
type SelectedProfile = NonNullable<
  Awaited<ReturnType<typeof getDashboardShellData>>['selectedProfile']
>;

async function resolveProfileRailSeed(clerkUserId: string): Promise<{
  readonly profileId: string | null;
  readonly selectedProfile: SelectedProfile | null;
}> {
  try {
    const dashboardData = await getDashboardShellData(clerkUserId);
    if (dashboardData.dashboardLoadError) {
      return { profileId: null, selectedProfile: null };
    }
    const selectedProfile = dashboardData.selectedProfile;
    if (!selectedProfile) {
      return { profileId: null, selectedProfile: null };
    }

    return {
      profileId: selectedProfile.id,
      selectedProfile,
    };
  } catch (error) {
    logger.error(
      '[opportunity-inbox] profile rail data resolution failed; rendering inbox without profile data',
      error
    );
    return { profileId: null, selectedProfile: null };
  }
}

export async function OpportunityInboxRoute() {
  const clerkUserId = await loadAuthenticatedAppShellUserId({
    route: APP_ROUTES.DASHBOARD,
  });

  const profileRailSeedPromise = resolveProfileRailSeed(clerkUserId);
  const inboxPromise = loadOpportunityInboxData(clerkUserId);
  const profileRailSeed = await profileRailSeedPromise;

  const initialLinksPromise = profileRailSeed.profileId
    ? getProfileSocialLinks(profileRailSeed.profileId).catch(() => [])
    : Promise.resolve<ProfileSocialLink[]>([]);
  const tourDatesPromise = profileRailSeed.profileId
    ? loadOpportunityInboxTourDateSections(profileRailSeed.profileId)
    : Promise.resolve(undefined);

  const [baseInbox, initialLinks, tourDates] = await Promise.all([
    inboxPromise,
    initialLinksPromise,
    tourDatesPromise,
  ]);

  if (!baseInbox) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.DASHBOARD));
  }

  const inbox = tourDates ? { ...baseInbox, tourDates } : baseInbox;
  const connectedDSPs: readonly AvailableDSP[] = profileRailSeed.selectedProfile
    ? getCanonicalProfileDSPs(profileRailSeed.selectedProfile, initialLinks)
    : [];

  return (
    <OpportunityInboxPageClient
      inbox={inbox}
      initialLinks={initialLinks}
      connectedDSPs={connectedDSPs}
    />
  );
}
