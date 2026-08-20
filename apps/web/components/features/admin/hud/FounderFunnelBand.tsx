'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type {
  FounderFunnelData,
  FounderFunnelStage,
  FounderFunnelTimeRange,
} from '@/lib/admin/types';
import type { HudObservationState } from '@/lib/hud/observation';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS: ReadonlyArray<{
  value: FounderFunnelTimeRange;
  label: string;
}> = [
  { value: '7d', label: '7d' }, // ui-casing-allow: compact range pill
  { value: '30d', label: '30d' }, // ui-casing-allow: compact range pill
  { value: 'all', label: 'All Time' },
];

function formatPercent(rate: number | null): string {
  if (rate === null) return '\u2014';
  return `${(rate * 100).toFixed(1)}%`;
}

async function fetchFounderFunnel(
  range: FounderFunnelTimeRange,
  signal: AbortSignal
): Promise<FounderFunnelData> {
  const response = await fetch(`/api/admin/hud/founder-funnel?range=${range}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as FounderFunnelData;
}

function RangeSelector({
  value,
  onChange,
}: Readonly<{
  readonly value: FounderFunnelTimeRange;
  readonly onChange: (range: FounderFunnelTimeRange) => void;
}>) {
  return (
    <AppSegmentControl
      size='sm'
      surface='ghost'
      value={value}
      onValueChange={onChange}
      options={RANGE_OPTIONS}
      aria-label='Funnel Time Range'
    />
  );
}

function StageConnector({
  stage,
  isBiggestLeak,
}: Readonly<{
  readonly stage: FounderFunnelStage;
  readonly isBiggestLeak: boolean;
}>) {
  return (
    <div
      className='flex shrink-0 flex-col items-center justify-center px-0.5'
      aria-hidden='true'
    >
      <span
        className={cn(
          'text-xs font-medium tabular-nums',
          isBiggestLeak ? 'text-error' : 'text-tertiary-token'
        )}
      >
        {stage.conversionRate === null
          ? '\u2014'
          : formatPercent(stage.conversionRate)}
      </span>
      <span
        className={cn(
          'text-sm leading-none',
          isBiggestLeak ? 'text-error' : 'text-tertiary-token'
        )}
      >
        →
      </span>
    </div>
  );
}

function FunnelStageTile({
  stage,
  isBiggestLeak,
}: Readonly<{
  readonly stage: FounderFunnelStage;
  readonly isBiggestLeak: boolean;
}>) {
  return (
    <div
      className={cn(
        'min-w-32 shrink-0 rounded-(--radius-md) border p-2.5',
        isBiggestLeak ? 'border-error' : 'border-transparent'
      )}
      data-testid={`founder-funnel-stage-${stage.key}`}
      title={stage.description}
    >
      <p className='text-2xs font-semibold text-tertiary-token'>
        {stage.label}
      </p>
      <p className='mt-0.5 text-2xl font-semibold leading-none tracking-tight text-primary-token tabular-nums'>
        {stage.count.toLocaleString('en-US')}
      </p>
      <p
        className={cn(
          'mt-1 text-xs',
          isBiggestLeak ? 'font-medium text-error' : 'text-tertiary-token'
        )}
      >
        {isBiggestLeak && stage.dropOff !== null
          ? `Biggest drop-off · −${stage.dropOff.toLocaleString('en-US')}`
          : stage.dropOff === null
            ? 'Top of funnel'
            : `−${stage.dropOff.toLocaleString('en-US')} lost`}
      </p>
    </div>
  );
}

function FunnelFlow({
  funnel,
}: Readonly<{ readonly funnel: FounderFunnelData }>) {
  const isEmpty = funnel.stages.every(stage => stage.count === 0);

  if (isEmpty) {
    return (
      <HudObservationStatus
        state='empty'
        message='No funnel data yet. Zero is shown only after a successful observation.'
        testId='hud-bottleneck-observation'
      />
    );
  }

  return (
    <ul className='flex items-stretch gap-1 overflow-x-auto'>
      {funnel.stages.map((stage, i) => {
        const isBiggestLeak = stage.key === funnel.biggestDropOffKey;
        return (
          <li key={stage.key} className='flex list-none items-center'>
            {i > 0 ? (
              <StageConnector stage={stage} isBiggestLeak={isBiggestLeak} />
            ) : null}
            <FunnelStageTile stage={stage} isBiggestLeak={isBiggestLeak} />
          </li>
        );
      })}
    </ul>
  );
}

function FunnelFlowSkeleton() {
  return (
    <div className='flex gap-3'>
      {['chats', 'accounts', 'claimed', 'onboarded', 'paid'].map(key => (
        <div key={key} className='min-w-32 p-2.5'>
          <div className='h-3 w-20 animate-pulse rounded bg-surface-1' />
          <div className='mt-1 h-6 w-14 animate-pulse rounded bg-surface-1' />
          <div className='mt-1 h-3 w-16 animate-pulse rounded bg-surface-1' />
        </div>
      ))}
    </div>
  );
}

function resolveFunnelObservation(query: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly data: FounderFunnelData | undefined;
}): HudObservationState {
  if (query.isLoading && !query.data) return 'loading';
  if (query.isError && !query.data) return 'unavailable';
  if (query.isError) return 'unavailable';
  if (!query.data) return 'empty';
  if (query.data.stages.every(stage => stage.count === 0)) return 'empty';
  return 'fresh';
}

/**
 * Scan-first customer/creator bottleneck. Funnel only — MRR and velocity
 * live once in the survival and noise bands.
 */
export function FounderFunnelBand({
  initialFunnel = null,
}: Readonly<{
  readonly initialFunnel?: FounderFunnelData | null;
}>) {
  const [range, setRange] = useState<FounderFunnelTimeRange>(
    initialFunnel?.timeRange ?? '30d'
  );

  const funnelQuery = useQuery({
    queryKey: ['hud', 'founder-funnel', range],
    queryFn: ({ signal }) => fetchFounderFunnel(range, signal),
    ...FREQUENT_CACHE,
    initialData:
      initialFunnel && range === initialFunnel.timeRange
        ? initialFunnel
        : undefined,
  });

  const funnel = funnelQuery.data;
  const observation = resolveFunnelObservation(funnelQuery);

  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Customer Bottleneck'
        subtitle='Death-step in onboarding chat to paid.'
        density='compact'
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        actions={<RangeSelector value={range} onChange={setRange} />}
      />
      <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
        {observation === 'loading' && !funnel ? (
          <FunnelFlowSkeleton />
        ) : funnel && observation !== 'unavailable' ? (
          <>
            {funnel.errors.length > 0 ? (
              <p className='mb-2 text-xs text-error'>
                {funnel.errors.join('; ')}
              </p>
            ) : null}
            <FunnelFlow funnel={funnel} />
          </>
        ) : funnel && observation === 'unavailable' ? (
          <>
            <FunnelFlow funnel={funnel} />
            <HudObservationStatus
              state='unavailable'
              message='Showing last known funnel. Retry to refresh.'
              onRetry={() => {
                funnelQuery.refetch().catch(() => {});
              }}
              testId='hud-bottleneck-observation'
            />
          </>
        ) : (
          <HudObservationStatus
            state={observation}
            message={
              observation === 'unavailable'
                ? 'Funnel data is unavailable.'
                : 'Funnel data is not configured.'
            }
            onRetry={
              observation === 'unavailable'
                ? () => {
                    funnelQuery.refetch().catch(() => {});
                  }
                : undefined
            }
            testId='hud-bottleneck-observation'
          />
        )}
      </div>
    </ContentSurfaceCard>
  );
}
