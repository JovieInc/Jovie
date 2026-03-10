'use client';

import { useEffect, useState } from 'react';
import { StatTile } from '@/components/molecules/drawer';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import type { Release } from './types';

interface SmartLinkAnalyticsResponse {
  totalClicks: number;
  last7DaysClicks: number;
  providerClicks: Array<{ provider: string; clicks: number }>;
}

async function fetchReleaseAnalytics(
  releaseId: string,
  signal?: AbortSignal
): Promise<SmartLinkAnalyticsResponse> {
  const res = await fetch(
    `/api/dashboard/releases/${encodeURIComponent(releaseId)}/analytics`,
    { signal }
  );

  if (!res.ok) {
    throw new Error('Failed to load release analytics');
  }

  return res.json() as Promise<SmartLinkAnalyticsResponse>;
}

const numberFormatter = new Intl.NumberFormat();

interface ReleaseSmartLinkAnalyticsProps {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
}

export function ReleaseSmartLinkAnalytics({
  release,
  providerConfig,
}: ReleaseSmartLinkAnalyticsProps) {
  const [data, setData] = useState<SmartLinkAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
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
  }, [release.id]);

  const totalClicks = data?.totalClicks ?? 0;
  const last7DaysClicks = data?.last7DaysClicks ?? 0;
  const providerClicks = data?.providerClicks ?? [];

  const showEmpty = !isLoading && !hasError && totalClicks === 0;

  const topProviders = providerClicks.slice(0, 4);

  const showSkeleton = isLoading && !data;

  return (
    <div className='min-h-[188px]'>
      <div>
        {showSkeleton && (
          <div className='space-y-2'>
            <div className='grid grid-cols-2 rounded-md border border-subtle bg-surface-1 p-3'>
              <div className='space-y-1'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
              <div className='space-y-1 border-l border-subtle pl-3'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
            </div>
            <div className='space-y-2'>
              <div className='h-[10px] w-20 rounded skeleton' />
              <div className='divide-y divide-subtle/60 rounded-lg border border-subtle/60 bg-surface-2/25'>
                {[1, 2, 3].map(item => (
                  <div
                    key={`provider-skeleton-${item}`}
                    className='flex items-center justify-between px-3 py-2'
                  >
                    <div className='flex items-center gap-2'>
                      <div className='h-2 w-2 rounded-full skeleton' />
                      <div className='h-3 w-16 rounded skeleton' />
                    </div>
                    <div className='h-3 w-8 rounded skeleton' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!showSkeleton && hasError && (
          <p className='text-[13px] text-tertiary-token'>
            Analytics unavailable
          </p>
        )}

        {!showSkeleton && !hasError && (
          <div
            className={cn(
              'transition-opacity duration-100',
              isSwitching && 'opacity-50'
            )}
          >
            <div className='grid grid-cols-2 rounded-md border border-subtle bg-surface-1 p-3'>
              <div>
                <StatTile
                  label='Total clicks'
                  value={numberFormatter.format(totalClicks)}
                  hint='All time'
                />
              </div>
              <div className='border-l border-subtle pl-3'>
                <StatTile
                  label='Last 7 days'
                  value={numberFormatter.format(last7DaysClicks)}
                  hint='Recent'
                />
              </div>
            </div>

            {showEmpty && (
              <p className='mt-1.5 text-[11px] text-tertiary-token'>
                Share your smart link to start tracking clicks.
              </p>
            )}

            {!showEmpty && topProviders.length > 0 && (
              <div className='mt-2 space-y-2'>
                <p className='text-[10px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
                  Top platforms
                </p>
                <div className='divide-y divide-subtle/60 rounded-lg border border-subtle/60 bg-surface-2/25'>
                  {topProviders.map(provider => {
                    const key = provider.provider as ProviderKey;
                    const label =
                      providerConfig[key]?.label ??
                      provider.provider ??
                      'Other';
                    const accent = providerConfig[key]?.accent ?? '#64748B';
                    return (
                      <div
                        key={provider.provider}
                        className='flex items-center justify-between px-3 py-2 text-[13px]'
                      >
                        <div className='flex items-center gap-2 text-secondary-token'>
                          <span
                            className='h-2 w-2 rounded-full'
                            style={{ backgroundColor: accent }}
                            aria-hidden='true'
                          />
                          <span>{label}</span>
                        </div>
                        <span className='tabular-nums text-primary-token'>
                          {numberFormatter.format(provider.clicks)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
