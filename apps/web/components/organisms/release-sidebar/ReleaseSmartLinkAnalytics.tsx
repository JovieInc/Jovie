'use client';

import { useEffect, useState } from 'react';
import { StatTile } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';
import type { Release, ReleaseSidebarAnalytics } from './types';

async function fetchReleaseAnalytics(
  releaseId: string,
  signal?: AbortSignal
): Promise<ReleaseSidebarAnalytics> {
  const res = await fetch(
    `/api/dashboard/releases/${encodeURIComponent(releaseId)}/analytics`,
    { signal }
  );

  if (!res.ok) {
    throw new Error('Failed to load release analytics');
  }

  return res.json() as Promise<ReleaseSidebarAnalytics>;
}

const numberFormatter = new Intl.NumberFormat();

interface ReleaseSmartLinkAnalyticsProps {
  readonly release: Release;
  readonly analyticsOverride?: ReleaseSidebarAnalytics | null;
}

export function ReleaseSmartLinkAnalytics({
  release,
  analyticsOverride,
}: ReleaseSmartLinkAnalyticsProps) {
  const [data, setData] = useState<ReleaseSidebarAnalytics | null>(
    analyticsOverride ?? null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (analyticsOverride) {
      setData(analyticsOverride);
      setIsLoading(false);
      setIsSwitching(false);
      setHasError(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(prev => (data === null ? true : prev));
    setIsSwitching(data !== null);
    setHasError(false);

    fetchReleaseAnalytics(release.id, controller.signal)
      .then(response => {
        if (!controller.signal.aborted) setData(response);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setHasError(true);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsSwitching(false);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data ref is intentionally stale to detect first-load vs switch
  }, [release.id, analyticsOverride]);

  const totalClicks = data?.totalClicks ?? 0;
  const last7DaysClicks = data?.last7DaysClicks ?? 0;

  const showEmpty = !isLoading && !hasError && totalClicks === 0;

  const showSkeleton = isLoading && !data;

  return (
    <div className='min-h-[116px]'>
      <div>
        {showSkeleton && (
          <div className='space-y-2'>
            <div className='grid grid-cols-2 rounded-[9px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-2'>
              <div className='space-y-1'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-4.5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
              <div className='space-y-1 border-l border-(--linear-border-subtle) pl-2'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-4.5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
            </div>
          </div>
        )}

        {!showSkeleton && hasError && (
          <div className='flex min-h-[72px] items-center rounded-[9px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3'>
            <p className='text-[11.5px] leading-[16px] text-(--linear-text-secondary)'>
              Analytics unavailable
            </p>
          </div>
        )}

        {!showSkeleton && !hasError && (
          <div
            className={cn(
              'transition-opacity duration-100',
              isSwitching && 'opacity-50'
            )}
          >
            <div className='grid grid-cols-2 rounded-[9px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'>
              <div>
                <StatTile
                  label='Total clicks'
                  value={numberFormatter.format(totalClicks)}
                  hint='All time'
                />
              </div>
              <div className='border-l border-(--linear-border-subtle) pl-2'>
                <StatTile
                  label='Last 7 days'
                  value={numberFormatter.format(last7DaysClicks)}
                  hint='Recent'
                />
              </div>
            </div>

            {showEmpty && (
              <div className='mt-1 flex min-h-[36px] items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-2.5'>
                <p className='text-[10px] leading-[13px] text-(--linear-text-tertiary)'>
                  Share your smart link to start tracking clicks.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
