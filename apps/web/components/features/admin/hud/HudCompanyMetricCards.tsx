'use client';

// @coverage-via apps/web/tests/unit/app/ops-cockpit.test.tsx

import type { ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { computeRatePercent } from '@/lib/analytics/metrics';
import { deriveOvieCompanyOverview } from '@/lib/ovie/company-operations';
import type { ShippingStateView } from '@/lib/ovie/shipping-state-client';
import type { HudMetrics } from '@/types/hud';

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function CockpitMetricCard({
  label,
  value,
  subtitle,
  testId,
  state,
}: Readonly<{
  readonly label: string;
  readonly value: ReactNode;
  readonly subtitle: string;
  readonly testId: string;
  readonly state?: string;
}>) {
  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid={testId}
      data-state={state}
    >
      <div className='flex h-32 flex-col gap-1 p-3'>
        <p className='truncate text-2xs font-semibold tracking-normal text-tertiary-token'>
          {label}
        </p>
        <p className='truncate text-2xl font-semibold leading-none tracking-tight text-primary-token tabular-nums sm:text-3xl'>
          {value}
        </p>
        <p className='mt-auto line-clamp-2 text-xs leading-4 text-secondary-token'>
          {subtitle}
        </p>
      </div>
    </ContentSurfaceCard>
  );
}

function companySubtitle(metrics: HudMetrics): string {
  if (!metrics.overview.financialDataAvailable) {
    return metrics.overview.defaultStatusDetail;
  }
  const runway =
    metrics.overview.runwayMonths === null
      ? 'no finite runway'
      : `${metrics.overview.runwayMonths.toFixed(1)}mo runway`;
  return `${formatUsd(metrics.overview.balanceUsd)} cash · ${runway}`;
}

function growthSubtitle(metrics: HudMetrics): string {
  if (!metrics.overview.financialDataAvailable) {
    return 'Revenue source not connected';
  }
  return `${formatUsd(metrics.overview.mrrUsd)} MRR · ${metrics.overview.activeSubscribers.toLocaleString('en-US')} paying`;
}

function shippingSummary(view: ShippingStateView): {
  value: string;
  subtitle: string;
} {
  const last = view.delivery.merges.last7Days.value;
  if (last === null) {
    return { value: '—', subtitle: 'Merges not measured' };
  }
  const prior = view.delivery.merges.prior7Days.value;
  const wow =
    prior === null || prior === 0
      ? null
      : computeRatePercent(last - prior, prior, 0);
  return {
    value: last.toLocaleString('en-US'),
    subtitle:
      wow === null
        ? 'merged last 7 days'
        : `merged last 7 days (${wow >= 0 ? '+' : ''}${wow}% WoW)`,
  };
}

function blockerSummary(metrics: HudMetrics): {
  value: string;
  subtitle: string;
} {
  const count = metrics.aiOps.counts.blocked + metrics.aiOps.counts.failed;
  return {
    value: count.toLocaleString('en-US'),
    subtitle: `${metrics.aiOps.mergeQueue.openAgentPrs.toLocaleString('en-US')} agent PRs open · ${metrics.reliability.unresolvedSentryIssues24h.toLocaleString('en-US')} unresolved errors`,
  };
}

/**
 * Top row of the executive cockpit: company survival, week-over-week growth,
 * shipping velocity, and critical blockers. Fixed-height compact cards so
 * the grid never shifts between poll states.
 */
export function HudCompanyMetricCards({
  metrics,
  shipping,
}: Readonly<{
  readonly metrics: HudMetrics;
  readonly shipping: ShippingStateView;
}>) {
  const overview = deriveOvieCompanyOverview(metrics);
  const survival = overview.metrics[0];
  const growth = overview.metrics[1];
  const ship = shippingSummary(shipping);
  const blockers = blockerSummary(metrics);

  return (
    <div
      className='grid grid-cols-2 gap-3 lg:grid-cols-4'
      data-testid='hud-company-metrics'
    >
      <CockpitMetricCard
        label='Company'
        value={survival.value}
        subtitle={companySubtitle(metrics)}
        testId='ovie-core-metric-company-survival'
        state={survival.state}
      />
      <CockpitMetricCard
        label='Week Over Week'
        value={growth.value}
        subtitle={growthSubtitle(metrics)}
        testId='ovie-core-metric-primary-outcome'
        state={growth.state}
      />
      <CockpitMetricCard
        label='Shipping'
        value={ship.value}
        subtitle={ship.subtitle}
        testId='hud-metric-shipping'
      />
      <CockpitMetricCard
        label='Critical Blockers'
        value={blockers.value}
        subtitle={blockers.subtitle}
        testId='hud-metric-blockers'
      />
    </div>
  );
}
