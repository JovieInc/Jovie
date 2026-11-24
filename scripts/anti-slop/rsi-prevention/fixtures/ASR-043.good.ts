/** Legitimate: warm uses the same infinite key + filter shape the table reads (ASR-043). */
import type { QueryClient } from '@tanstack/react-query';

declare const queryKeys: {
  audience: {
    members: (id: string, filters: Record<string, unknown>) => unknown[];
  };
};

const filters = {
  sort: 'lastSeen',
  direction: 'desc',
  segments: [] as string[],
  view: 'all',
};

export function warmAudience(queryClient: QueryClient, profileId: string) {
  queryClient.prefetchInfiniteQuery({
    queryKey: [...queryKeys.audience.members(profileId, filters)],
    queryFn: async () => ({ rows: [], total: null, hasMore: false }),
    initialPageParam: 'first',
  });
}
