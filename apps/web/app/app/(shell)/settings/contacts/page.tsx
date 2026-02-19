import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { queryKeys } from '@/lib/queries/keys';
import { getQueryClient } from '@/lib/queries/server';
import { getDashboardData } from '../../dashboard/actions';
import { getProfileContactsForOwner } from '../../dashboard/contacts/actions';

export const runtime = 'nodejs';

export default async function SettingsContactsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/contacts');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  // Prefetch contacts into the shared QueryClient so the client component
  // gets an instant cache hit instead of showing a loading skeleton.
  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.contacts.list(profileId),
      queryFn: () => getProfileContactsForOwner(profileId),
    });
  }

  return <DashboardSettings focusSection='contacts' />;
}
