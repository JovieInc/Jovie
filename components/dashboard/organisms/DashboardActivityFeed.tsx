'use client';

import { BoltIcon } from '@heroicons/react/24/outline';
import { useFeatureGate } from '@statsig/react-bindings';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { usePollingCoordinator } from '@/lib/hooks/usePollingCoordinator';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

type Activity = {
  id: string;
  description: string;
  icon: string;
  timestamp: string;
};

function formatTimeAgo(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const diff = Date.now() - parsed.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DashboardActivityFeed({
  profileId,
  range = '7d',
  refreshSignal,
}: {
  profileId: string;
  range?: '7d' | '30d' | '90d';
  refreshSignal?: number;
}) {
  const gate = useFeatureGate(STATSIG_FLAGS.AUDIENCE_V2);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  // Fetch activity data
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

  // Use polling coordinator for auto-refresh
  const { registerTask, unregisterTask } = usePollingCoordinator();

  // Initial load
  useEffect(() => {
    if (!gate) return;
    void fetchActivity();
  }, [gate, fetchActivity, refreshSignal]);

  // Register polling task after initial load
  useEffect(() => {
    if (!gate) {
      unregisterTask('activity-feed');
      return;
    }

    // Only register polling after initial load completes
    if (!hasLoadedOnceRef.current) {
      return;
    }

    const cleanup = registerTask({
      id: 'activity-feed',
      callback: async () => {
        // Only refresh silently (no loading state) for polling
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

  if (!gate) {
    return null;
  }

  return (
    <div className='space-y-4' data-testid='dashboard-activity-feed'>
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold leading-5 text-primary-token'>
            Activity
          </h3>
        </div>
        <span className='inline-flex shrink-0 items-center gap-2 rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-secondary-token'>
          <span
            aria-hidden='true'
            className='h-1.5 w-1.5 rounded-full bg-emerald-500'
          />
          Live
        </span>
      </div>

      <div className='min-h-[220px]'>
        {error ? (
          <div className='rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500'>
            {error}
          </div>
        ) : isLoading ? (
          <div
            className='space-y-3 rounded-xl border border-subtle bg-surface-1/20 p-4'
            aria-busy='true'
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className='flex items-center gap-3'
                aria-hidden='true'
              >
                <LoadingSkeleton
                  height='h-8'
                  width='h-8'
                  rounded='lg'
                  className='w-8'
                />
                <div className='flex-1 space-y-2'>
                  <LoadingSkeleton height='h-4' width='w-3/4' />
                  <LoadingSkeleton height='h-3' width='w-1/3' />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div
            className={
              isRefreshing ? 'opacity-70 transition-opacity' : undefined
            }
          >
            <div className='rounded-xl border border-subtle bg-surface-1/20 p-4'>
              <div className='flex items-start gap-3'>
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1'>
                  <BoltIcon className='h-5 w-5 text-secondary-token' />
                </div>

                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold leading-5 text-primary-token'>
                    No activity yet
                  </p>
                  <p className='mt-1 text-sm leading-5 text-secondary-token'>
                    Share your profile link to start tracking fan activity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={
              isRefreshing ? 'opacity-70 transition-opacity' : undefined
            }
          >
            <ul className='divide-y divide-white/5 overflow-hidden rounded-xl border border-subtle bg-surface-1/20'>
              {activities.map(activity => (
                <li
                  key={activity.id}
                  className='flex items-center gap-3 px-4 py-3'
                >
                  <span
                    aria-hidden='true'
                    className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1 text-base'
                  >
                    {activity.icon}
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm leading-5 text-primary-token'>
                      <span className='text-secondary-token tabular-nums'>
                        {formatTimeAgo(activity.timestamp)}
                      </span>
                      <span className='text-tertiary-token'> - </span>
                      <span className='text-primary-token'>
                        {activity.description}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
