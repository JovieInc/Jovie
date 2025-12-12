'use client';

import { BoltIcon } from '@heroicons/react/24/outline';
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
    <div className='space-y-4'>
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
            <div key={i} className='flex items-center gap-3' aria-hidden='true'>
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

              {profileHandle ? (
                <div className='mt-3'>
                  <CopyToClipboardButton
                    relativePath={`/${profileHandle}`}
                    idleLabel='Copy link'
                    className='rounded-md border border-subtle bg-transparent px-3 text-[13px] font-semibold text-primary-token hover:bg-surface-2'
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <ul className='space-y-2'>
          {activities.map(activity => (
            <li
              key={activity.id}
              className='flex items-start gap-3 rounded-xl border border-subtle bg-surface-1/20 p-3'
            >
              <span
                aria-hidden='true'
                className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1 text-lg'
              >
                {activity.icon}
              </span>
              <div className='min-w-0 flex-1'>
                <p className='text-sm leading-5 text-primary-token'>
                  {activity.description}
                </p>
                <p className='mt-1 text-xs leading-4 text-secondary-token'>
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
