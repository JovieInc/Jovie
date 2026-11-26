import {
  Check,
  Circle,
  CircleAlert,
  Clock3,
  Minus,
  SkipForward,
  X,
} from 'lucide-react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import type { FunnelStage, FunnelView } from '@/lib/analytics/funnel-view';
import { cn } from '@/lib/utils';

const statuses = {
  verified: {
    label: 'Verified',
    icon: Check,
    tone: 'border-success text-success',
  },
  failed: { label: 'Failed', icon: X, tone: 'border-error text-error' },
  blocked: {
    label: 'Blocked',
    icon: CircleAlert,
    tone: 'border-warning text-warning',
  },
  skipped: {
    label: 'Skipped',
    icon: SkipForward,
    tone: 'border-subtle text-secondary-token',
  },
  stale: {
    label: 'Stale',
    icon: Clock3,
    tone: 'border-warning text-warning',
  },
  unknown: {
    label: 'Unverified',
    icon: Minus,
    tone: 'border-subtle text-secondary-token',
  },
  measured: {
    label: 'Measured',
    icon: Circle,
    tone: 'border-subtle text-primary-token',
  },
} satisfies Record<
  FunnelStage['status'],
  { label: string; icon: typeof Check; tone: string }
>;

const countFormat = new Intl.NumberFormat('en-US');

export function FunnelTracker({
  view,
  vertical = false,
  hideTitle = false,
  loading = false,
}: {
  readonly view: FunnelView;
  readonly vertical?: boolean;
  readonly hideTitle?: boolean;
  readonly loading?: boolean;
}) {
  const bottleneck = view.stages.find(stage => stage.id === view.bottleneckId);
  return (
    <section
      className='min-w-0 space-y-3'
      aria-label={view.title}
      aria-busy={loading}
    >
      {hideTitle ? null : (
        <h3 className='text-balance text-sm font-semibold text-primary-token'>
          {view.title}
        </h3>
      )}
      {view.caption ? (
        <p className='text-xs text-secondary-token tabular-nums'>
          {view.caption}
        </p>
      ) : null}
      <ol
        className={cn(
          'flex min-w-0 list-none',
          vertical
            ? 'flex-col gap-2'
            : 'flex-col sm:flex-row sm:overflow-x-auto sm:pb-2'
        )}
      >
        {view.stages.map(stage => {
          const isBottleneck = stage.id === view.bottleneckId;
          const { label, icon: Icon, tone } = statuses[stage.status];
          return (
            <li
              key={stage.id}
              data-status={stage.status}
              aria-current={isBottleneck ? 'step' : undefined}
              className={cn(
                'group relative flex gap-2',
                vertical
                  ? 'items-center'
                  : 'min-h-11 items-center sm:min-w-24 sm:flex-1 sm:flex-col sm:text-center'
              )}
            >
              {vertical ? null : (
                <span
                  aria-hidden='true'
                  className='absolute inset-y-0 start-3 w-px bg-surface-2 group-first:top-1/2 group-last:bottom-1/2 sm:inset-x-0 sm:top-3 sm:bottom-auto sm:h-px sm:w-auto sm:group-first:top-3 sm:group-first:start-1/2 sm:group-last:end-1/2'
                />
              )}
              <span
                className={cn(
                  'relative grid size-6 shrink-0 place-items-center rounded-full border bg-surface-1',
                  !vertical && 'sm:mx-auto',
                  isBottleneck && 'border-2',
                  tone
                )}
              >
                <Icon aria-hidden='true' className='size-3.5' />
              </span>
              <span
                className={cn(
                  'min-w-0',
                  vertical
                    ? 'flex flex-1 items-center justify-between gap-2'
                    : 'flex flex-1 items-center justify-between gap-2 sm:block sm:px-1'
                )}
              >
                <span className='block text-xs font-medium text-primary-token'>
                  {loading ? (
                    <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
                  ) : stage.evidenceUrl ? (
                    <a
                      className='underline underline-offset-2'
                      href={stage.evidenceUrl}
                    >
                      {stage.label}
                    </a>
                  ) : (
                    stage.label
                  )}
                </span>
                <span className='block text-xs text-secondary-token tabular-nums'>
                  {loading ? (
                    <LoadingSkeleton height='h-4' width='w-10' rounded='sm' />
                  ) : stage.status === 'measured' &&
                    stage.count !== undefined ? (
                    <>
                      {countFormat.format(stage.count)}
                      <span
                        data-funnel-rate
                        className={cn(
                          'inline-block text-end',
                          vertical && 'min-w-8'
                        )}
                      >
                        {stage.rate ? ` · ${stage.rate}` : null}
                      </span>
                    </>
                  ) : (
                    label
                  )}
                  {isBottleneck ? ' · Bottleneck' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {bottleneck?.detail ? (
        <p className='text-xs text-secondary-token'>
          <span className='font-medium text-primary-token'>
            {bottleneck.label}
          </span>{' '}
          · {bottleneck.detail}
        </p>
      ) : null}
    </section>
  );
}
