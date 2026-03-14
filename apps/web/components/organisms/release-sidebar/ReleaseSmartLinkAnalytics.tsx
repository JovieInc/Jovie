'use client';

import { useEffect, useState } from 'react';
import {
  DrawerEmptyState,
  DrawerStatGrid,
  StatTile,
} from '@/components/molecules/drawer';
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
    <div className='min-h-[112px]'>
      <div>
        {showSkeleton && (
          <div className='space-y-2'>
            <DrawerStatGrid>
              <div className='space-y-1.5 pr-3'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-5 w-10 rounded skeleton' />
                <div className='h-3 w-10 rounded skeleton' />
              </div>
              <div className='space-y-1.5 pl-3'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-5 w-10 rounded skeleton' />
                <div className='h-3 w-10 rounded skeleton' />
              </div>
            </DrawerStatGrid>
          </div>
        )}

        {!showSkeleton && hasError && (
          <DrawerEmptyState
            className='min-h-[76px]'
            message='Analytics unavailable'
          />
        )}

        {!showSkeleton && !hasError && (
          <div
            className={cn(
              'transition-opacity duration-100',
              isSwitching && 'opacity-50'
            )}
          >
            <DrawerStatGrid>
              <div className='pr-2.5'>
                <StatTile
                  label='Total clicks'
                  value={numberFormatter.format(totalClicks)}
                  hint='All time'
                />
              </div>
              <div className='pl-2.5'>
                <StatTile
                  label='Last 7 days'
                  value={numberFormatter.format(last7DaysClicks)}
                  hint='Recent'
                />
              </div>
            </DrawerStatGrid>

            {showEmpty && (
              <p className='mt-2 px-1 text-[12px] leading-[17px] text-(--linear-text-secondary)'>
                Share your smart link to start tracking clicks.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
