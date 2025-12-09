'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import { useEffect, useState } from 'react';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
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
    <div className='rounded-lg border border-subtle bg-surface-1 p-6 shadow-sm'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-xs uppercase tracking-wider text-secondary-token'>
            Activity feed
          </p>
          <h3 className='text-lg font-semibold text-primary-token'>
            Recent actions
          </h3>
        </div>
        <span className='rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-secondary-token'>
          Live
        </span>
      </div>

      {error ? (
        <p className='mt-4 text-sm text-red-500'>{error}</p>
      ) : isLoading ? (
        <p className='mt-4 text-sm text-secondary-token'>Loading activity...</p>
      ) : activities.length === 0 ? (
        <div className='mt-4 space-y-2 text-sm text-secondary-token'>
          <div>
            <p className='font-medium text-primary-token'>
              Waiting for activity… 🚀
            </p>
            <p>Share your link to get started.</p>
          </div>
          {profileHandle ? (
            <div>
              <CopyToClipboardButton
                relativePath={`/${profileHandle}`}
                idleLabel='Copy your link'
                className='bg-transparent border border-black/10 dark:border-white/10 text-secondary-token hover:bg-black/5 dark:hover:bg-white/5 hover:text-primary-token active:scale-[0.97] transition-transform duration-150 ease-out'
              />
            </div>
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
