import { redirect } from 'next/navigation';
import { OpportunityInboxPageClient } from '@/components/features/opportunity-inbox/OpportunityInboxPageClient';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { loadOpportunityInboxData } from '@/lib/connectors/opportunity-inbox-data';
import { loadAuthenticatedAppShellUserId } from './app-shell-route-context';

export async function OpportunityInboxRoute() {
  const clerkUserId = await loadAuthenticatedAppShellUserId({
    route: APP_ROUTES.DASHBOARD,
  });
  const inbox = await loadOpportunityInboxData(clerkUserId);

  if (!inbox) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.DASHBOARD));
  }

  return <OpportunityInboxPageClient inbox={inbox} />;
}
