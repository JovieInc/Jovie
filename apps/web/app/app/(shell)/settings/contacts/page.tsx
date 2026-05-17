import { getCachedAuth } from '@/lib/auth/cached';
import { queryKeys } from '@/lib/queries';
import { getQueryClient } from '@/lib/queries/server';
import { getDashboardShellData } from '../../dashboard/actions';
import { getProfileContactsForOwner } from '../../dashboard/contacts/actions';
import { ContactsContent } from './ContactsContent';

export const runtime = 'nodejs';

export default async function SettingsContactsPage() {
  const { userId } = await getCachedAuth();
  const dashboardData = userId ? await getDashboardShellData(userId) : null;

  // Prefetch contacts into the shared QueryClient so the client component
  // gets an instant cache hit instead of showing a loading skeleton.
  const profileId = dashboardData?.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.contacts.list(profileId),
      queryFn: () => getProfileContactsForOwner(profileId),
    });
  }

  return <ContactsContent />;
}
