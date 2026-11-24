/** Deliberate-red: dead warm keys that consumers do not read (ASR-043). */
import type { QueryClient } from '@tanstack/react-query';

declare const queryKeys: {
  audience: { members: (id: string) => unknown[] };
  dspEnrichment: { presence: (id: string) => unknown[] };
};

export function warmDead(queryClient: QueryClient, profileId: string) {
  queryClient.prefetchQuery({
    queryKey: queryKeys.audience.members(profileId),
    queryFn: async () => [],
  });
  queryClient.prefetchQuery({
    queryKey: queryKeys.dspEnrichment.presence(profileId),
    queryFn: async () => [],
  });
}
