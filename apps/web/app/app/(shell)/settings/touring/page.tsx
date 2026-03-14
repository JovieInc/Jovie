import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { queryKeys } from '@/lib/queries';
import { getQueryClient } from '@/lib/queries/server';
import { getDashboardData } from '../../dashboard/actions';
import { checkBandsintownConnection } from '../../dashboard/tour-dates/actions';

export const runtime = 'nodejs';

export default async function SettingsTouringPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings/touring`);
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  // Prefetch Bandsintown connection status so the client component
  // gets an instant cache hit instead of showing a loading skeleton.
  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.tourDates.connection(profileId),
      queryFn: () => checkBandsintownConnection(),
    });
  }

  return <DashboardSettings focusSection='touring' />;
}
