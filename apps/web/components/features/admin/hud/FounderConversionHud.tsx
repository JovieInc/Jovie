'use client';

import { useQuery } from '@tanstack/react-query';
import type { ShippingVelocityResponse } from '@/app/api/admin/hud/shipping-velocity/route';
import { FounderFunnelBand } from '@/components/features/admin/hud/FounderFunnelBand';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { FounderFunnelData } from '@/lib/admin/types';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';

const HERO_VALUE_CLASS =
  'text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

async function fetchShippingVelocity(
  signal: AbortSignal
): Promise<ShippingVelocityResponse> {
  const response = await fetch('/api/admin/hud/shipping-velocity?range=30d', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as ShippingVelocityResponse;
}

function sumMerged(buckets: readonly { readonly merged: number }[]): number {
  return buckets.reduce((total, bucket) => total + bucket.merged, 0);
}

function formatMergesPerDay(
  buckets: readonly { readonly merged: number }[]
): string {
  const last7 = buckets.slice(-7);
  if (last7.length === 0) return '—';
  const perDay = sumMerged(last7) / last7.length;
  return perDay.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Compatibility wrapper for leftover Overview mounts. Canonical Ops
 * rendering is FounderFunnelBand on /hud; MRR and velocity stay in their
 * own HUD bands.
 */
export function FounderConversionHud({
  mrrUsd,
  initialFunnel,
}: Readonly<{
  /** Current MRR in USD, or null when Stripe data is unavailable */
  readonly mrrUsd: number | null;
  readonly initialFunnel: FounderFunnelData;
}>) {
  const velocityQuery = useQuery({
    queryKey: ['hud', 'kpi', 'shipping-velocity', '30d'],
    queryFn: ({ signal }) => fetchShippingVelocity(signal),
    ...FREQUENT_CACHE,
  });

  const mergesPerDay = velocityQuery.data
    ? formatMergesPerDay(velocityQuery.data.data)
    : '—';

  return (
    <div className='space-y-4' data-testid='founder-conversion-hud'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <ContentMetricCard
          label='MRR'
          value={mrrUsd === null ? '—' : formatUsd(mrrUsd)}
          subtitle='Monthly recurring revenue'
          valueClassName={HERO_VALUE_CLASS}
          data-testid='founder-hud-mrr'
        />
        <ContentMetricCard
          label='Shipping Velocity'
          value={mergesPerDay === '—' ? '—' : `${mergesPerDay}/day`}
          subtitle='PRs merged per day, avg last 7 days'
          valueClassName={HERO_VALUE_CLASS}
          data-testid='founder-hud-shipping-velocity'
        />
      </div>

      <FounderFunnelBand initialFunnel={initialFunnel} />
    </div>
  );
}

export function FounderConversionHudSkeleton() {
  return (
    <div className='space-y-4' data-testid='founder-conversion-hud-skeleton'>
      <div className='grid gap-4 sm:grid-cols-2'>
        {['mrr', 'velocity'].map(key => (
          <div key={key} className='rounded-(--radius-md) p-3.5'>
            <div className='h-3 w-24 animate-pulse rounded bg-surface-1' />
            <div className='mt-1.5 h-8 w-28 animate-pulse rounded bg-surface-1' />
          </div>
        ))}
      </div>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <div className='min-h-20' />
      </ContentSurfaceCard>
    </div>
  );
}
