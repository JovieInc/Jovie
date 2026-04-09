import type { Metadata } from 'next';
import { getCachedAuth } from '@/lib/auth/cached';
// Must render the same chat UI as /app/chat — see AGENTS.md guardrail #16
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { DeferredChatPageClient } from './chat/DeferredChatPageClient';
import { getDashboardShellData } from './dashboard/actions';
import { loadReleaseMatrix } from './dashboard/releases/actions';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';
const DASHBOARD_TITLE = 'Home | Jovie';

export function generateMetadata(): Metadata {
  return {
    title: DASHBOARD_TITLE,
    description: DASHBOARD_DESCRIPTION,
  };
}

export default async function AppRootPage() {
  const { userId } = await getCachedAuth();
  if (userId) {
    const dashboardData = await getDashboardShellData(userId);
    const profileId = dashboardData.selectedProfile?.id;
    if (profileId) {
      const queryClient = getQueryClient();
      await queryClient.prefetchQuery({
        queryKey: queryKeys.releases.matrix(profileId),
        queryFn: () => loadReleaseMatrix(profileId),
      });
    }
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <DeferredChatPageClient />
    </HydrateClient>
  );
}
