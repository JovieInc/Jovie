'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { usePollingCoordinator } from '@/lib/hooks/usePollingCoordinator';
import type { Activity, ActivityRange, UseActivityFeedReturn } from './types';

interface UseActivityFeedOptions {
  profileId: string;
  range: ActivityRange;
  refreshSignal?: number;
}

export function useActivityFeed({
  profileId,
  range,
  refreshSignal,
}: UseActivityFeedOptions): UseActivityFeedReturn {
  const gate = useFeatureGate(STATSIG_FLAGS.AUDIENCE_V2);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const fetchActivity = useCallback(async () => {
    const controller = new AbortController();
    const isInitialLoad = !hasLoadedOnceRef.current;
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const url = `/api/dashboard/activity/recent?profileId=${encodeURIComponent(profileId)}&range=${encodeURIComponent(range)}`;

    try {
      const response = await fetch(url, { signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to load activity');
      }
      const data = payload as { activities?: Activity[] };
      setActivities(data.activities ?? []);
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
      setIsRefreshing(false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load activity');
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [profileId, range]);

  const { registerTask, unregisterTask } = usePollingCoordinator();

  useEffect(() => {
    if (!gate) return;
    void fetchActivity();
  }, [gate, fetchActivity, refreshSignal]);

  useEffect(() => {
    if (!gate) {
      unregisterTask('activity-feed');
      return;
    }

    if (!hasLoadedOnceRef.current) {
      return;
    }

    const cleanup = registerTask({
      id: 'activity-feed',
      callback: async () => {
        const url = `/api/dashboard/activity/recent?profileId=${encodeURIComponent(profileId)}&range=${encodeURIComponent(range)}`;
        try {
          const response = await fetch(url);
          const payload = await response.json().catch(() => null);
          if (response.ok) {
            const data = payload as { activities?: Activity[] };
            setActivities(data.activities ?? []);
          }
        } catch {
          // ignore auto-refresh errors
        }
      },
      intervalMs: 60_000,
      priority: 2,
      enabled: true,
    });

    return cleanup;
  }, [gate, profileId, range, registerTask, unregisterTask]);

  return {
    activities,
    isLoading,
    isRefreshing,
    error,
    isEnabled: Boolean(gate),
  };
}
