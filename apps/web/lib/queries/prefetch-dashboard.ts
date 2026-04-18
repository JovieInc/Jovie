import type { QueryClient } from '@tanstack/react-query';
import { loadDspPresenceForProfile } from '@/app/app/(shell)/dashboard/presence/actions';
import { loadReleaseMatrix } from '@/app/app/(shell)/dashboard/releases/actions';
import { getTasks } from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { FREQUENT_CACHE } from './cache-strategies';
import { createQueryFn, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

const fetchEarnings = createQueryFn('/api/dashboard/earnings');

/**
 * Prefetch dashboard page data into TanStack Query cache on nav hover.
 *
 * Maps dashboard route IDs to their primary query keys and fetch functions
 * so hovering a nav link warms the cache before the user clicks. Uses
 * FREQUENT_CACHE staleTime to avoid re-prefetching on rapid hover events.
 */
export function prefetchForRoute(
  routeId: string,
  queryClient: QueryClient,
  profileId: string | undefined
): void {
  if (!profileId) return;

  const { staleTime } = FREQUENT_CACHE;

  switch (routeId) {
    case 'releases':
      queryClient.prefetchQuery({
        queryKey: queryKeys.releases.matrix(profileId),
        queryFn: () => loadReleaseMatrix(profileId),
        staleTime,
      });
      break;
    case 'audience':
      // Audience uses cursor-based pagination — prefetch the first page
      queryClient.prefetchQuery({
        queryKey: queryKeys.audience.members(profileId),
        queryFn: ({ signal }) =>
          fetchWithTimeout<unknown>(
            `/api/dashboard/audience/members?profileId=${encodeURIComponent(profileId)}`,
            { signal }
          ),
        staleTime,
      });
      break;
    case 'presence':
      queryClient.prefetchQuery({
        queryKey: queryKeys.dspEnrichment.presence(profileId),
        queryFn: () => loadDspPresenceForProfile(profileId),
        staleTime,
      });
      break;
    case 'earnings':
      queryClient.prefetchQuery({
        queryKey: queryKeys.earnings.stats(),
        queryFn: fetchEarnings,
        staleTime,
      });
      break;
    case 'tasks':
      queryClient.prefetchQuery({
        queryKey: queryKeys.tasks.list(profileId),
        queryFn: () => getTasks(),
        staleTime,
      });
      break;
    // 'profile' is chat-driven — no data prefetch needed
  }
}
