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
}

const METRIC_TILE_CLASSNAME = 'px-3 py-2.5';

function MetricTile({
  label,
  value,
  hint,
  id,
}: Readonly<DrawerAnalyticsSummaryMetric>) {
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
      {hint ? (
        <p className='mt-1 text-[10px] leading-[13px] text-tertiary-token'>
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

export function DrawerAnalyticsSummaryCard({
  metrics,
  state,
  dimmed = false,
  footer,
  emptyMessage,
  errorMessage = 'Analytics unavailable',
  testId,
  variant = 'card',
}: Readonly<DrawerAnalyticsSummaryCardProps>) {
  const tileCount = metrics.length > 0 ? metrics.length : 2;
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
          'transition-opacity duration-150',
          dimmed && 'opacity-60'
        )}
      >
        <div className='space-y-3 px-3 py-3'>
          {state === 'loading' ? (
            <output
              aria-label='Loading analytics'
              className={cn('grid gap-2.5', gridClassName)}
            >
              {loadingMetricKeys.map(metricKey => (
                <LoadingMetricTile key={metricKey} />
              ))}
            </output>
          ) : null}

          {state === 'error' ? (
            <div className='flex min-h-[72px] items-center'>
              <p className='text-[12px] leading-[18px] tracking-[0.01em] text-secondary-token'>
                {errorMessage}
              </p>
            </div>
          ) : null}

          {state === 'ready' && metrics.length > 0 ? (
            <div className={cn('grid gap-2.5', gridClassName)}>
              {metrics.map(metric => (
                <MetricTile key={metric.id} {...metric} />
              ))}
            </div>
          ) : null}

          {state === 'ready' && metrics.length === 0 && emptyMessage ? (
            <div className='flex min-h-[72px] items-center'>
              <p className='text-[12px] leading-[18px] tracking-[0.01em] text-secondary-token'>
                {emptyMessage}
              </p>
            </div>
          ) : null}
        </div>

        {footer ? <div className='px-3 pb-3'>{footer}</div> : null}
      </div>
    </DrawerSurfaceCard>
  );
}
