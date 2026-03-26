'use client';

import { useEffect, useState } from 'react';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import {
  DrawerEmptyState,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
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

  const smartLinkUrl = release.smartLinkPath
    ? `${getBaseUrl()}${release.smartLinkPath}`
    : '';

  return (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.sidebarCard, 'overflow-hidden')}
      testId='release-smart-link-analytics'
    >
      {/* Smart link URL + actions */}
      {release.smartLinkPath && (
        <div className='px-2.5 pt-2.5 pb-2'>
          <CopyableUrlRow
            url={smartLinkUrl}
            displayValue={release.smartLinkPath}
            size='md'
            valueClassName='text-tertiary-token'
            copyButtonTitle='Copy link'
            openButtonTitle='Open smart link'
            surface='boxed'
          />
        </div>
      )}

      {/* Analytics metrics */}
      <div
        className={cn(
          'px-3 pb-3',
          release.smartLinkPath && 'pt-0',
          !release.smartLinkPath && 'pt-3'
        )}
      >
        {showSkeleton && (
          <div className='grid grid-cols-2 divide-x divide-(--linear-app-frame-seam)'>
            <div className='space-y-1 pr-3'>
              <div className='h-[9px] w-12 rounded skeleton' />
              <div className='h-4 w-8 rounded skeleton' />
              <div className='h-[9px] w-10 rounded skeleton' />
            </div>
            <div className='space-y-1 pl-3'>
              <div className='h-[9px] w-12 rounded skeleton' />
              <div className='h-4 w-8 rounded skeleton' />
              <div className='h-[9px] w-10 rounded skeleton' />
            </div>
          </div>
        )}

        {!showSkeleton && hasError && (
          <DrawerEmptyState
            className='min-h-[52px] px-0 py-0'
            message='Analytics unavailable'
          />
        )}

        {!showSkeleton && !hasError && (
          <div
            className={cn(
              'space-y-2 transition-opacity duration-100',
              isSwitching && 'opacity-50'
            )}
          >
            <div className='grid grid-cols-2 divide-x divide-(--linear-app-frame-seam)'>
              <AnalyticsMetric
                label='Total clicks'
                value={numberFormatter.format(totalClicks)}
                hint='All time'
                className='pr-3'
              />
              <AnalyticsMetric
                label='Last 7 days'
                value={numberFormatter.format(last7DaysClicks)}
                hint='Recent'
                className='pl-3'
              />
            </div>

            {showEmpty && (
              <DrawerEmptyState
                className='min-h-[32px] px-0 py-0'
                message='Share your smart link to start tracking clicks.'
              />
            )}
          </div>
        )}
      </div>
    </DrawerSurfaceCard>
  );
}

function AnalyticsMetric({
  label,
  value,
  hint,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly className?: string;
}) {
  return (
    <div className={cn('space-y-px', className)}>
      <p className='text-[10.5px] font-[500] leading-[14px] text-tertiary-token'>
        {label}
      </p>
      <p className='tabular-nums text-[18px] font-[590] leading-none tracking-[-0.02em] text-primary-token'>
        {value}
      </p>
      <p className='text-[10px] leading-[13px] text-tertiary-token'>{hint}</p>
    </div>
  );
}
