'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerAnalyticsSummaryMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

export interface DrawerAnalyticsSummaryCardProps {
  readonly metrics: readonly DrawerAnalyticsSummaryMetric[];
  readonly state: 'loading' | 'error' | 'ready';
  readonly dimmed?: boolean;
  readonly footer?: ReactNode;
  readonly emptyMessage?: string;
  readonly errorMessage?: string;
  readonly testId?: string;
  readonly variant?: 'card' | 'flat';
  readonly stableLayout?: boolean;
  readonly reserveFooterSlot?: boolean;
  readonly metricSlotCount?: 1 | 2;
}

const METRIC_TILE_CLASSNAME = 'px-3 py-2.5';
const STABLE_ANALYTICS_BODY_CLASSNAME = 'min-h-[106px]';
const STABLE_ANALYTICS_FOOTER_CLASSNAME = 'min-h-[40px]';

function MetricTile({
  label,
  value,
  hint,
  id,
  reserveHint = false,
}: Readonly<DrawerAnalyticsSummaryMetric> & {
  readonly reserveHint?: boolean;
}) {
  return (
    <div
      className={METRIC_TILE_CLASSNAME}
      data-testid={`drawer-analytics-metric-${id}`}
    >
      <p className='text-[10.5px] font-caption leading-[14px] text-tertiary-token'>
        {label}
      </p>
      <p
        className='mt-1 tabular-nums text-[20px] font-[620] leading-none tracking-[-0.03em] text-primary-token'
        data-testid={`drawer-analytics-metric-value-${id}`}
      >
        {value}
      </p>
      {hint || reserveHint ? (
        <p
          aria-hidden={hint ? undefined : true}
          className={cn(
            'mt-1 min-h-[13px] text-[10px] leading-[13px] text-tertiary-token',
            !hint && 'invisible'
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function LoadingMetricTile() {
  return (
    <div aria-hidden='true' className={METRIC_TILE_CLASSNAME}>
      <div className='h-[11px] w-16 rounded skeleton' />
      <div className='mt-2 h-6 w-12 rounded skeleton' />
      <div className='mt-2 h-[10px] w-14 rounded skeleton' />
    </div>
  );
}

function DrawerAnalyticsSummaryBody({
  state,
  metrics,
  emptyMessage,
  errorMessage,
  gridClassName,
  loadingMetricKeys,
  stableLayout,
}: Readonly<{
  state: DrawerAnalyticsSummaryCardProps['state'];
  metrics: readonly DrawerAnalyticsSummaryMetric[];
  emptyMessage?: string;
  errorMessage: string;
  gridClassName: string;
  loadingMetricKeys: readonly string[];
  stableLayout: boolean;
}>) {
  if (state === 'loading') {
    return (
      <output
        aria-label='Loading analytics'
        className={cn('grid gap-2.5', gridClassName)}
      >
        {loadingMetricKeys.map(metricKey => (
          <LoadingMetricTile key={metricKey} />
        ))}
      </output>
    );
  }

  if (state === 'error') {
    return (
      <div className='flex min-h-[72px] items-center'>
        <p className='text-xs leading-[18px] tracking-[0.01em] text-secondary-token'>
          {errorMessage}
        </p>
      </div>
    );
  }

  if (metrics.length > 0) {
    return (
      <div className={cn('grid gap-2.5', gridClassName)}>
        {metrics.map(metric => (
          <MetricTile key={metric.id} {...metric} reserveHint={stableLayout} />
        ))}
      </div>
    );
  }

  if (emptyMessage) {
    return (
      <div className='flex min-h-[72px] items-center'>
        <p className='text-xs leading-[18px] tracking-[0.01em] text-secondary-token'>
          {emptyMessage}
        </p>
      </div>
    );
  }

  return null;
}

function DrawerAnalyticsSummaryFooter({
  footer,
  reserveFooterSlot,
  testId,
}: Readonly<{
  footer?: ReactNode;
  reserveFooterSlot: boolean;
  testId?: string;
}>) {
  if (!footer && !reserveFooterSlot) {
    return null;
  }

  return (
    <div
      aria-hidden={footer ? undefined : true}
      data-testid={testId ? `${testId}-footer` : undefined}
      className={cn(
        'px-3 pb-3',
        reserveFooterSlot && STABLE_ANALYTICS_FOOTER_CLASSNAME,
        !footer && 'invisible'
      )}
    >
      {footer ?? '\u00a0'}
    </div>
  );
}

export function DrawerAnalyticsSummaryCard({
  metrics,
  state,
  dimmed = false,
  footer,
  emptyMessage,
  errorMessage = 'Analytics unavailable',
  testId,
  variant = 'card',
  stableLayout = false,
  reserveFooterSlot = false,
  metricSlotCount,
}: Readonly<DrawerAnalyticsSummaryCardProps>) {
  const tileCount =
    metricSlotCount ?? (metrics.length > 0 ? metrics.length : 2);
  const gridClassName = tileCount === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const isBusy = dimmed || state === 'loading';
  const loadingMetricKeys = Array.from(
    { length: tileCount },
    (_, slot) => `loading-${tileCount}-${slot}`
  );

  return (
    <DrawerSurfaceCard
      variant={variant}
      testId={testId}
      className='overflow-hidden'
      aria-busy={isBusy ? true : undefined}
    >
      <div
        className={cn(
          'transition-opacity duration-subtle',
          dimmed && 'opacity-60'
        )}
      >
        <div
          data-testid={testId ? `${testId}-body` : undefined}
          className={cn(
            'space-y-3 px-3 py-3',
            stableLayout && STABLE_ANALYTICS_BODY_CLASSNAME
          )}
        >
          <DrawerAnalyticsSummaryBody
            state={state}
            metrics={metrics}
            emptyMessage={emptyMessage}
            errorMessage={errorMessage}
            gridClassName={gridClassName}
            loadingMetricKeys={loadingMetricKeys}
            stableLayout={stableLayout}
          />
        </div>

        <DrawerAnalyticsSummaryFooter
          footer={footer}
          reserveFooterSlot={reserveFooterSlot}
          testId={testId}
        />
      </div>
    </DrawerSurfaceCard>
  );
}
