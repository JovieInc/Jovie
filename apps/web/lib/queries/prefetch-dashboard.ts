import type { QueryClient } from '@tanstack/react-query';
import { loadDspPresenceForProfile } from '@/app/app/(shell)/dashboard/presence/actions';
import { getTasks } from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { loadTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { loadReleaseMatrix } from '@/lib/releases/release-matrix-loader';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';
import type { DashboardContact } from '@/types/contacts';
import { FREQUENT_CACHE } from './cache-strategies';
import { createQueryFn, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { tourDateToEventRecord } from './useEventsQuery';

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
    case 'library':
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
        queryKey: queryKeys.tasks.list(
          profileId,
          DEFAULT_TASK_WORKSPACE_FILTERS
        ),
        queryFn: () => getTasks(DEFAULT_TASK_WORKSPACE_FILTERS),
        staleTime,
      });
      break;
    // 'profile' is chat-driven — no data prefetch needed
  }
}

/**
 * Warm the caches behind the chat entity right panels (releases matrix,
 * contacts, events) so opening a panel from an entity chip paints content
 * immediately instead of a loading state. Keys and fetchers mirror
 * useReleasesQuery / useContactsQuery / useEventsQuery exactly.
 */
export function prefetchChatEntityPanelData(
  queryClient: QueryClient,
  profileId: string
): void {
  const { staleTime } = FREQUENT_CACHE;

  queryClient.prefetchQuery({
    queryKey: queryKeys.releases.matrix(profileId),
    queryFn: () => loadReleaseMatrix(profileId),
    staleTime,
  });
  queryClient.prefetchQuery({
    queryKey: queryKeys.contacts.list(profileId),
    queryFn: ({ signal }) =>
      fetchWithTimeout<DashboardContact[]>(
        `/api/dashboard/contacts?profileId=${encodeURIComponent(profileId)}`,
        { signal }
      ),
    staleTime,
  });
  queryClient.prefetchQuery({
    queryKey: queryKeys.events.list(profileId),
    queryFn: async () => {
      const dates = await loadTourDates(profileId);
      return dates.map(tourDateToEventRecord);
    },
    staleTime,
  });
}
