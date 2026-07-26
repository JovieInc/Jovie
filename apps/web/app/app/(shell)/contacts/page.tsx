import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { ContactsPageClient } from './ContactsPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Contacts | Jovie',
  description: 'Manage bookings, management, and press contacts',
};

export default async function ContactsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.CONTACTS,
    dashboardErrorLogMessage: 'Dashboard data load failed on contacts page',
    dashboardErrorMessage: 'Failed to load contacts. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const profile = routeContext.dashboardData.selectedProfile;
  if (!profile) {
    return (
      <PageErrorState message='Unable to load your artist profile. Please refresh the page.' />
    );
  }

  return (
    <ContactsPageClient
      profileId={profile.id}
      artistName={profile.displayName?.trim() || profile.username}
      artistHandle={profile.usernameNormalized ?? profile.username}
    />
  );
}
