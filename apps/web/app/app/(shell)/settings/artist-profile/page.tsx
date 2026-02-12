import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../../dashboard/actions';
import { getProfileContactsForOwner } from '../../dashboard/contacts/actions';
import { checkBandsintownConnection } from '../../dashboard/tour-dates/actions';

export const runtime = 'nodejs';

export default async function SettingsArtistProfilePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/artist-profile');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  const [initialContacts, initialTourConnectionStatus] =
    dashboardData.selectedProfile
      ? await Promise.all([
          getProfileContactsForOwner(dashboardData.selectedProfile.id),
          checkBandsintownConnection(),
        ])
      : [
          [],
          {
            connected: false,
            artistName: null,
            lastSyncedAt: null,
            hasApiKey: false,
          },
        ];

  return (
    <DashboardSettings
      focusSection='artist-profile'
      initialContacts={initialContacts}
      initialTourConnectionStatus={initialTourConnectionStatus}
    />
  );
}
