import { queryKeys } from '@/lib/queries';
import { getQueryClient } from '@/lib/queries/server';
import { getDashboardData } from '../../dashboard/actions';
import { checkBandsintownConnection } from '../../dashboard/tour-dates/actions';
import { TouringContent } from './TouringContent';

export const runtime = 'nodejs';

export default async function SettingsTouringPage() {
  const dashboardData = await getDashboardData();

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

  return <TouringContent />;
}
