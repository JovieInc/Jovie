'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from './keys';

const attempted = new Set<string>();

/**
 * Fire-and-forget: ask the server to link a provable YouTube channel. No UI,
 * no loading state, no error surface. The server throttles and fails closed.
 */
export function useSilentYouTubeLink(profileId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!profileId || attempted.has(profileId)) return;
    attempted.add(profileId);
    void fetch(
      `/api/dashboard/youtube-verification?profileId=${encodeURIComponent(profileId)}`,
      { method: 'POST' }
    )
      .then(res => (res.ok ? res.json() : null))
      .then((body: { status?: string } | null) => {
        if (body?.status !== 'linked') return;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.dashboard.socialLinks(),
        });
      })
      .catch(() => {
        attempted.delete(profileId);
      });
  }, [profileId, queryClient]);
}
