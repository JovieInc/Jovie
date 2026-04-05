import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { getDashboardShellData } from '../actions';
import { loadDspPresenceForProfile } from './actions';
import { PresencePageClient } from './PresencePageClient';

export const runtime = 'nodejs';

/**
 * Presence page — client-first with server prefetch.
 *
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs first. On first visit,
 * presence data is prefetched into TanStack Query cache and hydrated to the
 * client. On subsequent navigations, the client component renders from cache
 * instantly (no skeleton), with background refetch if stale.
 */
export default async function PresencePage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.PRESENCE}`);
  }

  const dashboardData = await getDashboardShellData(userId);

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const profileId = dashboardData.selectedProfile?.id;

  // Prefetch presence data into TanStack cache for instant client render
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.dspEnrichment.presence(profileId),
      queryFn: () => loadDspPresenceForProfile(profileId),
    });
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <PresencePageClient />
    </HydrateClient>
  );
}
