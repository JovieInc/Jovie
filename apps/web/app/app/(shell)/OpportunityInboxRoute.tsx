import { redirect } from 'next/navigation';
import { OpportunityInboxPageClient } from '@/components/features/opportunity-inbox/OpportunityInboxPageClient';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { loadOpportunityInboxData } from '@/lib/connectors/opportunity-inbox-data';
import { logger } from '@/lib/utils/logger';
import { loadAuthenticatedAppShellUserId } from './app-shell-route-context';
import { getDashboardShellData } from './dashboard/actions';

/**
 * Resolve the selected profile id for the tour-date inbox sections. Fail-soft:
 * the inbox must still render suggested-action cards when dashboard shell
 * data is unavailable, so any error degrades to null (sections omitted).
 */
async function resolveSelectedProfileId(
  clerkUserId: string
): Promise<string | null> {
  try {
    const dashboardData = await getDashboardShellData(clerkUserId);
    if (dashboardData.dashboardLoadError) {
      return null;
    }
    return dashboardData.selectedProfile?.id ?? null;
  } catch (error) {
    logger.error(
      '[opportunity-inbox] selected profile resolution failed; skipping tour-date sections',
      error
    );
    return null;
  }
}

export async function OpportunityInboxRoute() {
  const clerkUserId = await loadAuthenticatedAppShellUserId({
    route: APP_ROUTES.DASHBOARD,
  });
  const profileId = await resolveSelectedProfileId(clerkUserId);
  const inbox = await loadOpportunityInboxData(clerkUserId, { profileId });

  if (!inbox) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.DASHBOARD));
  }

  return <OpportunityInboxPageClient inbox={inbox} />;
}
