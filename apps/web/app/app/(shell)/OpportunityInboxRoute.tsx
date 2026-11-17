import { redirect } from 'next/navigation';
import { OpportunityInboxPageClient } from '@/components/features/opportunity-inbox/OpportunityInboxPageClient';
import { PmfSurveyCard } from '@/components/features/pmf-survey/PmfSurveyCard';
import { APP_ROUTES } from '@/constants/routes';
import { checkIsAdmin } from '@/lib/admin/middleware';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import {
  loadOpportunityInboxData,
  loadOpportunityInboxTourDateSections,
} from '@/lib/connectors/opportunity-inbox-data';
import type { AvailableDSP } from '@/lib/dsp';
import { shouldShowPmfSurvey } from '@/lib/pmf/prompt.server';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import { logger } from '@/lib/utils/logger';
import { loadAuthenticatedAppShellUserId } from './app-shell-route-context';
import {
  getDashboardShellData,
  getProfileSocialLinks,
  type ProfileSocialLink,
} from './dashboard/actions';
import { PipelineBottleneckBannerLazy } from './PipelineBottleneckBannerLazy';
import { dismissPmfSurvey, submitPmfSurveyAnswer } from './pmf-survey-actions';

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
  readonly profileContextAvailable: boolean;
}> {
  try {
    const dashboardData = await getDashboardShellData(clerkUserId);
    if (dashboardData.dashboardLoadError) {
      return {
        profileId: null,
        selectedProfile: null,
        profileContextAvailable: false,
      };
    }
    const selectedProfile = dashboardData.selectedProfile;
    if (!selectedProfile) {
      return {
        profileId: null,
        selectedProfile: null,
        profileContextAvailable: true,
      };
    }

    return {
      profileId: selectedProfile.id,
      selectedProfile,
      profileContextAvailable: true,
    };
  } catch (error) {
    logger.error(
      '[opportunity-inbox] profile rail data resolution failed; rendering inbox without profile data',
      error
    );
    return {
      profileId: null,
      selectedProfile: null,
      profileContextAvailable: false,
    };
  }
}

export async function OpportunityInboxRoute({
  initialView = 'needs',
}: {
  readonly initialView?: 'needs' | 'done';
} = {}) {
  const clerkUserId = await loadAuthenticatedAppShellUserId({
    route: APP_ROUTES.DASHBOARD,
  });

  const adminPromise = checkIsAdmin();
  const profileRailSeedPromise = resolveProfileRailSeed(clerkUserId);
  const inboxPromise = loadOpportunityInboxData(clerkUserId);
  const pmfSurveyPromise = shouldShowPmfSurvey({ now: new Date() });
  const profileRailSeed = await profileRailSeedPromise;

  const initialLinksPromise = profileRailSeed.profileId
    ? getProfileSocialLinks(profileRailSeed.profileId).catch(() => [])
    : Promise.resolve<ProfileSocialLink[]>([]);
  const tourDatesPromise = profileRailSeed.profileId
    ? loadOpportunityInboxTourDateSections(profileRailSeed.profileId)
    : Promise.resolve(undefined);

  const [baseInbox, initialLinks, tourDates, isAdmin, showPmfSurvey] =
    await Promise.all([
      inboxPromise,
      initialLinksPromise,
      tourDatesPromise,
      adminPromise,
      pmfSurveyPromise,
    ]);

  if (!baseInbox) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.DASHBOARD));
  }

  const inbox = tourDates
    ? ({
        ...baseInbox,
        tourDates,
        availability: {
          suggestedActions:
            baseInbox.availability?.suggestedActions ?? 'unknown',
          tourDates: tourDates.availability ?? 'unknown',
        },
      } as const)
    : ({
        ...baseInbox,
        availability: {
          suggestedActions:
            baseInbox.availability?.suggestedActions ?? 'unknown',
          tourDates: profileRailSeed.profileContextAvailable
            ? 'not_requested'
            : 'unknown',
        },
      } as const);
  const connectedDSPs: readonly AvailableDSP[] = profileRailSeed.selectedProfile
    ? getCanonicalProfileDSPs(profileRailSeed.selectedProfile, initialLinks)
    : [];

  return (
    <>
      {isAdmin ? (
        <div className='h-24 shrink-0 px-6 py-2'>
          <PipelineBottleneckBannerLazy isAdmin={isAdmin} />
        </div>
      ) : null}
      {showPmfSurvey ? (
        <div className='shrink-0 px-6 pt-3'>
          <div className='max-w-xl'>
            <PmfSurveyCard
              onDismiss={dismissPmfSurvey}
              onSubmit={submitPmfSurveyAnswer}
            />
          </div>
        </div>
      ) : null}
      <OpportunityInboxPageClient
        key={`${clerkUserId}:${profileRailSeed.profileId ?? 'no-profile'}`}
        inbox={inbox}
        profileId={profileRailSeed.profileId}
        initialView={initialView}
        initialLinks={initialLinks}
        connectedDSPs={connectedDSPs}
      />
    </>
  );
}
