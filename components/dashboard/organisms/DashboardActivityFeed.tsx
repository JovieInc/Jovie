'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { useEffect, useState } from 'react';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
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
  profileHandle,
}: {
  profileId: string;
  profileHandle?: string;
}) {
  const gate = useFeatureGate(STATSIG_FLAGS.AUDIENCE_V2);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gate) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void fetch(
      `/api/dashboard/activity/recent?profileId=${encodeURIComponent(profileId)}`,
      { signal: controller.signal }
    )
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Unable to load activity');
        }
        const data = payload as { activities?: Activity[] };
        setActivities(data.activities ?? []);
        setIsLoading(false);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load activity'
        );
        setIsLoading(false);
      });

    const interval = setInterval(() => {
      if (gate) {
        void fetch(
          `/api/dashboard/activity/recent?profileId=${encodeURIComponent(profileId)}`,
          { signal: controller.signal }
        )
          .then(async response => {
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(payload?.error ?? 'Unable to load activity');
            }
            const data = payload as { activities?: Activity[] };
            setActivities(data.activities ?? []);
          })
          .catch(() => {
            // ignore auto-refresh errors
          });
      }
    }, 60_000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [gate, profileId]);

  if (!gate) {
    return null;
  }

  return (
    <div className='rounded-2xl bg-transparent p-1'>
      <div className='flex items-center justify-between px-1'>
        <div>
          <p className='text-[11px] uppercase tracking-[0.22em] text-secondary-token'>
            Activity feed
          </p>
          <h3 className='text-base font-semibold text-primary-token'>
            Recent actions
          </h3>
        </div>
        <span className='rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-secondary-token'>
          Live
        </span>
      </div>

      {error ? (
        <p className='mt-4 text-sm text-red-500'>{error}</p>
      ) : isLoading ? (
        <div className='mt-4 space-y-3' aria-busy='true'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='flex items-center gap-3' aria-hidden='true'>
              <LoadingSkeleton
                height='h-8'
                width='h-8'
                rounded='full'
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
        <div className='mt-4 space-y-3 rounded-2xl bg-surface-1/40 p-4 shadow-none ring-1 ring-black/5 dark:ring-white/5 text-sm text-secondary-token'>
          <div className='space-y-1'>
            <p className='text-sm font-semibold text-primary-token'>
              No activity yet
            </p>
            <p>Share your profile link to start tracking fan activity.</p>
          </div>
          {profileHandle ? (
            <CopyToClipboardButton
              relativePath={`/${profileHandle}`}
              idleLabel='Copy profile link'
              className='rounded-full border border-subtle px-3 text-[13px] font-semibold bg-transparent text-primary-token hover:bg-surface-2'
            />
          ) : null}
        </div>
      ) : (
        <ul className='mt-4 space-y-3 text-sm text-primary-token'>
          {activities.map(activity => (
            <li key={activity.id} className='flex items-center gap-3'>
              <span aria-hidden='true' className='text-xl'>
                {activity.icon}
              </span>
              <div>
                <p>{activity.description}</p>
                <p className='text-xs text-secondary-token'>
                  {formatTimeAgo(activity.timestamp)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
