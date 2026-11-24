import type { QueryClient } from '@tanstack/react-query';
import { getTasks } from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { loadTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { loadReleaseMatrix } from '@/lib/releases/release-matrix-loader';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';
import type { DashboardContact } from '@/types/contacts';
import type { AudienceMember } from '@/types';
import {
  audienceWarmFilterParams,
  buildAudienceMembersParams,
  DEFAULT_AUDIENCE_WARM,
} from './audience-members-params';
import { FREQUENT_CACHE } from './cache-strategies';
import { createQueryFn, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { tourDateToEventRecord } from './useEventsQuery';

interface AudienceWarmPage {
  rows: AudienceMember[];
  total: number | null;
  hasMore?: boolean;
  nextCursor?: string | null;
}

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
    case 'contacts':
      queryClient.prefetchQuery({
        queryKey: queryKeys.contacts.list(profileId),
        queryFn: ({ signal }) =>
          fetchWithTimeout<DashboardContact[]>(
            `/api/dashboard/contacts?profileId=${encodeURIComponent(profileId)}`,
            { signal }
          ),
        staleTime,
      });
      break;
    case 'calendar':
      queryClient.prefetchQuery({
        queryKey: queryKeys.events.list(profileId),
        queryFn: async () => {
          const dates = await loadTourDates(profileId);
          return dates.map(tourDateToEventRecord);
        },
        staleTime,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.releases.matrix(profileId),
        queryFn: () => loadReleaseMatrix(profileId),
        staleTime,
      });
      break;
    case 'audience': {
      // Must match useAudienceInfiniteQuery key + URL shape exactly, or the
      // warm write is dead cache (ASR-043). Defaults mirror DashboardAudienceClient.
      const filters = audienceWarmFilterParams();
      queryClient.prefetchInfiniteQuery({
        queryKey: [...queryKeys.audience.members(profileId, filters)],
        queryFn: async ({ pageParam, signal }) => {
          const params = buildAudienceMembersParams({
            profileId,
            view: filters.view,
            sort: filters.sort,
            direction: filters.direction,
            pageSize: DEFAULT_AUDIENCE_WARM.pageSize,
            cursor: pageParam === 'first' ? undefined : String(pageParam),
            segments: filters.segments,
          });
          return fetchWithTimeout<AudienceWarmPage>(
            `/api/dashboard/audience/members?${params.toString()}`,
            { signal }
          );
        },
        initialPageParam: 'first',
        getNextPageParam: (lastPage: AudienceWarmPage) =>
          lastPage.hasMore && lastPage.nextCursor
            ? lastPage.nextCursor
            : undefined,
        staleTime,
      });
      break;
    }
    case 'presence':
      // Identity (/app/presence) is ProfilesWorkspace (connection suggestions),
      // not the legacy DSP presence loader. Warming dspEnrichment.presence is a
      // dead cache write that burns the request budget (ASR-043). Identity is
      // SSR-first via loadProfilesWorkspaceData; do not invent a second warm.
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
