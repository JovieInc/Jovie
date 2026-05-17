'use client';

import { useQuery } from '@tanstack/react-query';
import type { AlbumArtCapability } from '@/lib/chat/album-art-capability';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

interface ChatCapabilitiesData {
  readonly tools: {
    readonly albumArt: AlbumArtCapability;
  };
}

export function useChatCapabilitiesQuery({
  profileId,
  enabled = true,
}: {
  readonly profileId?: string | null;
  readonly enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.chat.capabilities(profileId),
    queryFn: ({ signal }) => {
      const params = profileId
        ? `?profileId=${encodeURIComponent(profileId)}`
        : '';
      return fetchWithTimeout<ChatCapabilitiesData>(
        `/api/chat/capabilities${params}`,
        { signal }
      );
    },
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
