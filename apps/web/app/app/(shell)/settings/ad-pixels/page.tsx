import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getPixelSettingsForCurrentUser } from '@/lib/pixels/queries.server';
import { queryKeys } from '@/lib/queries/keys';
import { getQueryClient } from '@/lib/queries/server';
import { getDashboardData } from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsAdPixelsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/ad-pixels');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  // Prefetch pixel settings so the client component gets an instant cache hit.
  // This section is Pro-gated in the UI, but prefetching is harmless for free users
  // (SettingsPolished will render the upgrade card instead).
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.pixels.settings(),
    queryFn: () => getPixelSettingsForCurrentUser(),
  });

  return <DashboardSettings focusSection='ad-pixels' />;
}
