'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  type FullscreenFeed,
  fullscreenFeedStatus,
} from '@/lib/ovie/home/fullscreen-mode';

const TICK_MS = 5_000;

/**
 * Feed age ticks every 5s; sleep, tab-wake, focus and network return refetch
 * every active query so a woken screen never shows pre-sleep numbers as live.
 */
export function useOvieFeedStatus(feeds: readonly FullscreenFeed[]) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  // A feed that has not answered yet is judged from page load, so the first
  // seconds are not a false outage; it still turns stale, then down, if it never answers.
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = globalThis.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => globalThis.clearInterval(id);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
      void queryClient.refetchQueries({ type: 'active' });
    };
    document.addEventListener('visibilitychange', refresh);
    globalThis.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      globalThis.removeEventListener('online', refresh);
    };
  }, [queryClient]);
  const judged = feeds.map(feed => ({
    ...feed,
    updatedAtMs: feed.updatedAtMs || mountedAt,
  }));
  return { status: fullscreenFeedStatus(judged, now), now };
}
