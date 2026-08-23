'use client';

import type { ReactNode } from 'react';
import { HudMetricSourceTrust } from '@/app/app/(shell)/admin/ops/HudMetricSourceTrust';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricRow } from '@/components/molecules/ContentMetricRow';
import { isHudMetricValueAvailable } from '@/lib/hud/source-trust';
import type { HudMetrics } from '@/types/hud';

const BURN_LABEL = 'Burn (30d)';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatRunway(runwayMonths: number | null): string {
  if (runwayMonths == null) return '\u221E';
  if (!Number.isFinite(runwayMonths)) return '\u221E';
  if (runwayMonths < 0) return '0';
  return `${runwayMonths.toFixed(1)} mo`;
}

function metricSubtitleWithTrust(
  body: ReactNode,
  source: HudMetrics['sources'][keyof HudMetrics['sources']],
  onRetry?: () => void
): ReactNode {
  return (
    <>
      {body}
      <HudMetricSourceTrust source={source} onRetry={onRetry} />
    </>
  );
}

export function HudCashMrrBand({
  metrics,
  mrrValueClass,
  runwayValueClass,
  onRetry,
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly mrrValueClass: string;
  readonly runwayValueClass: string;
  readonly onRetry: () => void;
}>) {
  const stripeSource = metrics.sources.stripe;
  const mercurySource = metrics.sources.mercury;

  return (
    <div className='grid gap-3 md:grid-cols-2' data-testid='hud-cash-mrr'>
      <ContentMetricCard
        label='MRR'
        value={
          isHudMetricValueAvailable(stripeSource)
            ? formatUsd(metrics.overview.mrrUsd)
            : '\u2014'
        }
        subtitle={metricSubtitleWithTrust(
          <span>
            {isHudMetricValueAvailable(stripeSource)
              ? `${metrics.overview.activeSubscribers.toLocaleString('en-US')} subscribers`
              : 'Stripe data unavailable'}
          </span>,
          stripeSource,
          onRetry
        )}
        className='p-3'
        valueClassName={mrrValueClass}
      />
      <ContentMetricCard
        label='Runway'
        value={
          isHudMetricValueAvailable(mercurySource)
            ? formatRunway(metrics.overview.runwayMonths)
            : '\u2014'
        }
        subtitle={metricSubtitleWithTrust(
          isHudMetricValueAvailable(mercurySource) ? (
            <div className='grid gap-1.5'>
              <ContentMetricRow
                label='Cash'
                value={formatUsd(metrics.overview.balanceUsd)}
              />
              <ContentMetricRow
                label={BURN_LABEL}
                value={formatUsd(metrics.overview.burnRateUsd)}
              />
            </div>
          ) : (
            <span>Mercury data unavailable</span>
          ),
          mercurySource,
          onRetry
        )}
        className='p-3'
        valueClassName={runwayValueClass}
      />
    </div>
  );
}
