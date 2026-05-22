import { APP_ROUTES } from '@/constants/routes';
import { queryKeys } from '@/lib/queries';
import { getQueryClient } from '@/lib/queries/server';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { getProfileContactsForOwner } from '../../dashboard/contacts/actions';
import { ContactsContent } from './ContactsContent';

export const runtime = 'nodejs';

export default async function SettingsContactsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_CONTACTS,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings contacts page',
    dashboardErrorMessage:
      'Failed to load contacts settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  // Prefetch contacts into the shared QueryClient so the client component
  // gets an instant cache hit instead of showing a loading skeleton.
  const profileId = routeContext.profileId;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.contacts.list(profileId),
      queryFn: () => getProfileContactsForOwner(profileId),
    });
  }

  return <ContactsContent />;
}
