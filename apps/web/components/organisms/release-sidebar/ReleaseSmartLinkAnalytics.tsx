'use client';

import { useEffect, useState } from 'react';
import { DrawerSection } from '@/components/molecules/drawer';
import type { ProviderKey } from '@/lib/discography/types';
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

function StatTile({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className='rounded-lg border border-subtle bg-surface-2/40 px-3 py-2.5'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-tertiary-token'>
        {label}
      </p>
      <p className='mt-1 text-[18px] font-semibold tracking-tight text-primary-token tabular-nums'>
        {value}
      </p>
      {hint && <p className='text-[11px] text-tertiary-token'>{hint}</p>}
    </div>
  );
}

export function ReleaseSmartLinkAnalytics({
  release,
  providerConfig,
}: ReleaseSmartLinkAnalyticsProps) {
  const [data, setData] = useState<SmartLinkAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setHasError(false);
    setData(null);

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
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [release.id]);

  const totalClicks = data?.totalClicks ?? 0;
  const last7DaysClicks = data?.last7DaysClicks ?? 0;
  const providerClicks = data?.providerClicks ?? [];

  const showEmpty = !isLoading && !hasError && totalClicks === 0;

  const topProviders = providerClicks.slice(0, 4);

  return (
    <DrawerSection title='Smart link analytics'>
      {isLoading && (
        <div className='grid grid-cols-2 gap-3'>
          <div className='rounded-lg border border-subtle bg-surface-2/40 px-3 py-2.5'>
            <div className='h-3 w-16 rounded skeleton' />
            <div className='mt-2 h-5 w-12 rounded skeleton' />
          </div>
          <div className='rounded-lg border border-subtle bg-surface-2/40 px-3 py-2.5'>
            <div className='h-3 w-16 rounded skeleton' />
            <div className='mt-2 h-5 w-12 rounded skeleton' />
          </div>
        </div>
      )}

      {!isLoading && hasError && (
        <p className='text-xs text-error'>
          Analytics are temporarily unavailable.
        </p>
      )}

      {!isLoading && !hasError && (
        <>
          <div className='grid grid-cols-2 gap-3'>
            <StatTile
              label='Total clicks'
              value={numberFormatter.format(totalClicks)}
              hint='All time'
            />
            <StatTile
              label='Last 7 days'
              value={numberFormatter.format(last7DaysClicks)}
              hint='Recent'
            />
          </div>

          {showEmpty && (
            <p className='text-xs text-tertiary-token'>
              Share your smart link to start tracking clicks.
            </p>
          )}

          {!showEmpty && topProviders.length > 0 && (
            <div className='space-y-1.5'>
              <p className='text-[11px] font-semibold uppercase tracking-wide text-tertiary-token'>
                Top platforms
              </p>
              <div className='space-y-1'>
                {topProviders.map(provider => {
                  const key = provider.provider as ProviderKey;
                  const label =
                    providerConfig[key]?.label ?? provider.provider ?? 'Other';
                  const accent = providerConfig[key]?.accent ?? '#64748B';
                  return (
                    <div
                      key={provider.provider}
                      className='flex items-center justify-between text-xs'
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
        </>
      )}
    </DrawerSection>
  );
}
