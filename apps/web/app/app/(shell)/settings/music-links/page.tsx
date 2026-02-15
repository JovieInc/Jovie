import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDspMatchesForProfile } from '@/lib/dsp-enrichment/queries.server';
import { queryKeys } from '@/lib/queries/keys';
import { getQueryClient } from '@/lib/queries/server';
import { getDashboardData } from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsMusicLinksPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/music-links');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  // Prefetch DSP matches so ConnectedDspList gets an instant cache hit.
  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.dspEnrichment.matches(profileId, 'all'),
      queryFn: () => getDspMatchesForProfile(profileId, userId),
    });
  }

  return <DashboardSettings focusSection='music-links' />;
}
