'use client';

import { useQuery } from '@tanstack/react-query';
import { loadOwnGraphArtists } from '@/lib/chat/own-graph-artists';
import { STABLE_CACHE } from '@/lib/queries/cache-strategies';
import { queryKeys } from '@/lib/queries/keys';

/**
 * Claimed-self + catalog collaborator artists for the entity picker own-graph
 * tier (JOV-3717). Stable cache — identity and credits change rarely.
 */
export function useOwnGraphArtistsQuery(
  profileId: string,
  { enabled = true }: { readonly enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: queryKeys.chat.ownGraphArtists(profileId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action; AbortSignal not passable
    queryFn: () => loadOwnGraphArtists(profileId),
    ...STABLE_CACHE,
    enabled: enabled && Boolean(profileId),
  });
}
