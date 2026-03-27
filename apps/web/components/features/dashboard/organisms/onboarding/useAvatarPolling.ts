'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getProfileAvatarUrl } from '@/app/onboarding/actions/update-profile';

const AVATAR_POLL_INTERVAL_MS = 2000;
const AVATAR_POLL_TIMEOUT_MS = 30_000;

interface UseAvatarPollingParams {
  /** Start polling only when true (e.g., no avatar yet and enrichment is active) */
  enabled: boolean;
}

/**
 * Polls the server for the user's avatar URL.
 * Used to detect when a background OAuth avatar upload completes.
 *
 * Stops polling when:
 * - An avatar URL is found
 * - 30 seconds elapse (timeout)
 * - The hook is disabled (user manually uploaded)
 */
export function useAvatarPolling({ enabled }: UseAvatarPollingParams): {
  polledAvatarUrl: string | null;
} {
  const [polledAvatarUrl, setPolledAvatarUrl] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    if (enabled && !isComplete) {
      pollStartRef.current = Date.now();
    }
  }, [enabled, isComplete]);

  const isPolling = enabled && !isComplete && !polledAvatarUrl;

  const { data } = useQuery({
    queryKey: ['avatar-polling'],
    queryFn: ({ signal: _signal }) => getProfileAvatarUrl(),
    enabled: isPolling,
    refetchInterval: isPolling ? AVATAR_POLL_INTERVAL_MS : false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data || !isPolling) return;

    if (data.avatarUrl) {
      setPolledAvatarUrl(data.avatarUrl);
      setIsComplete(true);
      return;
    }

    const timedOut =
      pollStartRef.current > 0 &&
      Date.now() - pollStartRef.current > AVATAR_POLL_TIMEOUT_MS;

    if (timedOut) {
      setIsComplete(true);
    }
  }, [data, isPolling]);

  return { polledAvatarUrl };
}
