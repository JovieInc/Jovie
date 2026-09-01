'use client';

// @coverage-via apps/web/tests/unit/dashboard/JovieWorkFeed.test.tsx
import {
  Bell,
  Bot,
  CheckCircle2,
  CircleDashed,
  ImageIcon,
  Package,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { memo, type ReactNode } from 'react';
import {
  ACTIVITY_TIMELINE_LIST_CLASSNAME,
  ACTIVITY_TIMELINE_PRIMARY_TEXT_CLASSNAME,
  ActivityFeedSkeleton,
  ActivityTimelineIcon,
  ActivityTimelineMeta,
  ActivityTimelineRow,
  ActivityTimelineTimestamp,
} from '@/components/molecules/ActivityFeed';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import type {
  JovieWorkIcon,
  JovieWorkItem,
  JovieWorkOutcome,
  JovieWorkPhase,
} from '@/lib/activity/jovie-work-feed';
import { useJovieWorkFeedQuery } from '@/lib/queries/useJovieWorkFeedQuery';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import { formatAmount } from '@/lib/utils/format-number';
import type { JovieWorkFeedProps } from './types';

const JOVIE_WORK_ICONS: Record<JovieWorkIcon, typeof Sparkles> = {
  workflow: Workflow,
  agent: Bot,
  approval: CheckCircle2,
  retouch: ImageIcon,
  merch: Package,
  metadata: Sparkles,
  notification: Bell,
};

const PHASE_STYLES: Record<JovieWorkPhase, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

const OUTCOME_SLOT_CLASS_NAME =
  'mt-1 grid min-h-10 grid-cols-2 content-start gap-x-3 text-2xs leading-5 text-tertiary-token sm:grid-cols-4';
const countFormatter = new Intl.NumberFormat('en-US');

function JovieWorkGlyph({ icon }: { readonly icon: JovieWorkIcon }) {
  const Icon = JOVIE_WORK_ICONS[icon] ?? Sparkles;

  return <Icon className='h-3 w-3 text-tertiary-token' aria-hidden='true' />;
}

function JovieWorkEmptyState({
  isRefreshing,
}: {
  readonly isRefreshing: boolean;
}) {
  return (
    <div className={isRefreshing ? 'opacity-70 transition-opacity' : undefined}>
      <EmptyState
        heading='Jovie has not shipped autonomous work in this window yet.'
        description='Release autopilot, fan notifications, and agent runs will show up here.'
        className='min-h-45 py-8'
        testId='jovie-work-empty-state'
      />
    </div>
  );
}

function JovieWorkOutcomeSlot({
  outcome,
}: {
  readonly outcome?: JovieWorkOutcome;
}) {
  let content: ReactNode;
  let displayState: JovieWorkOutcome['state'] | 'reserved' = 'reserved';

  if (!outcome) {
    content = null;
  } else if (outcome.state === 'measuring') {
    displayState = outcome.state;
    content = (
      <span className='col-span-full'>
        Measuring attributed results for 30 days.
      </span>
    );
  } else if (outcome.state === 'measured_zero') {
    displayState = outcome.state;
    content = (
      <span className='col-span-full'>
        No attributed results in the 30-day window.
      </span>
    );
  } else if (outcome.state === 'unavailable' || !outcome.metrics) {
    displayState = 'unavailable';
    content = (
      <span className='col-span-full'>Attributed results are unavailable.</span>
    );
  } else {
    displayState = outcome.state;
    const metrics = [
      {
        key: 'gmv',
        value: outcome.metrics.gmvDeltaCents,
        valueLabel: formatAmount(outcome.metrics.gmvDeltaCents),
        label: 'GMV',
      },
      {
        key: 'clicks',
        value: outcome.metrics.clickDelta,
        valueLabel: countFormatter.format(outcome.metrics.clickDelta),
        label: 'Clicks',
      },
      {
        key: 'dsp-clicks',
        value: outcome.metrics.dspClickDelta,
        valueLabel: countFormatter.format(outcome.metrics.dspClickDelta),
        label: 'DSP Clicks',
      },
      {
        key: 'new-fans',
        value: outcome.metrics.newFansDelta,
        valueLabel: countFormatter.format(outcome.metrics.newFansDelta),
        label: 'New Fans',
      },
    ].filter(metric => metric.value > 0);

    content = metrics.map(metric => (
      <span key={metric.key} className='inline-flex min-w-0 gap-1'>
        <span className='tabular-nums text-primary-token'>
          {metric.valueLabel}
        </span>
        <span>{metric.label}</span>
      </span>
    ));
  }

  return (
    <div
      aria-hidden={outcome ? undefined : true}
      className={OUTCOME_SLOT_CLASS_NAME}
      data-testid='jovie-work-outcome-slot'
      data-outcome-state={displayState}
    >
      {content}
    </div>
  );
}

const JovieWorkItemRow = memo(function JovieWorkItemRow({
  item,
}: {
  readonly item: JovieWorkItem;
}) {
  return (
    <ActivityTimelineRow
      as='li'
      href={item.href}
      leading={
        <ActivityTimelineIcon>
          <JovieWorkGlyph icon={item.icon} />
        </ActivityTimelineIcon>
      }
    >
      <div className='flex flex-wrap items-center gap-2'>
        <p className='text-app font-caption tracking-tight text-primary-token'>
          {item.title}
        </p>
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-2xs font-caption',
            PHASE_STYLES[item.phase]
          )}
        >
          {item.statusLabel}
        </span>
      </div>
      <p
        className={`${ACTIVITY_TIMELINE_PRIMARY_TEXT_CLASSNAME} mt-0.5 text-secondary-token`}
      >
        {item.description}
      </p>
      <ActivityTimelineMeta>
        <ActivityTimelineTimestamp dateTime={item.timestamp}>
          {formatTimeAgo(item.timestamp)}
        </ActivityTimelineTimestamp>
      </ActivityTimelineMeta>
      {item.outcomeSlot ? (
        <JovieWorkOutcomeSlot outcome={item.outcome} />
      ) : null}
    </ActivityTimelineRow>
  );
});

export function JovieWorkFeed({
  profileId,
  range = '7d',
  showHeader = true,
}: JovieWorkFeedProps) {
  const {
    data: items = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useJovieWorkFeedQuery({
    profileId,
    range,
  });

  const isRefreshing = isFetching && !isLoading;

  return (
    <div className='space-y-1.5' data-testid='jovie-work-feed'>
      {showHeader ? (
        <div className='flex items-center justify-between gap-4'>
          <div className='flex items-center gap-2'>
            <div className='flex h-6 w-6 items-center justify-center rounded-full bg-surface-0'>
              <CircleDashed
                className='h-4 w-4 text-tertiary-token'
                aria-hidden='true'
              />
            </div>
            <h3 className='text-app font-caption tracking-tight text-secondary-token'>
              Jovie Did This
            </h3>
          </div>
          <span className='inline-flex shrink-0 items-center gap-1.5 text-2xs font-caption text-tertiary-token'>
            <span
              aria-hidden='true'
              className='h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse'
            />
            <span>Live</span>
          </span>
        </div>
      ) : null}

      <div className='min-h-45'>
        {(() => {
          if (error) {
            return (
              <PageErrorState
                title='Failed to load Jovie work feed'
                message={error.message || 'Please try again.'}
                error={error}
                actionLabel='Retry load'
                onRetry={() => {
                  void refetch();
                }}
              />
            );
          }

          if (isLoading) {
            return <ActivityFeedSkeleton rows={4} />;
          }

          if (items.length === 0) {
            return <JovieWorkEmptyState isRefreshing={isRefreshing} />;
          }

          return (
            <div
              className={
                isRefreshing ? 'opacity-70 transition-opacity' : undefined
              }
            >
              <ul className={ACTIVITY_TIMELINE_LIST_CLASSNAME}>
                {items.map(item => (
                  <JovieWorkItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {items.length > 0 &&
          `${items.length} ${items.length === 1 ? 'item' : 'items'} loaded`}
        {isRefreshing && 'Refreshing Jovie work feed'}
        {error && `Error: ${error.message || 'Failed to load Jovie work feed'}`}
      </div>
    </div>
  );
}
