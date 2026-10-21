'use client';

// @coverage-via apps/web/components/organisms/home-loop/HomeLoopKanban.test.tsx

import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import type { HomeLoopAttention, HomeLoopRow } from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import { useFitList } from './useFitList';

const ATTENTION_LABEL: Record<Exclude<HomeLoopAttention, null>, string> = {
  blocked: 'Blocked',
  failing: 'Failing',
  retrying: 'Retrying',
};

const ATTENTION_EDGE: Record<Exclude<HomeLoopAttention, null>, string> = {
  blocked: 'border-l-error',
  failing: 'border-l-warning',
  retrying: 'border-l-warning',
};

const LANE_FRAME = 'flex min-h-0 min-w-0 flex-col gap-1.5';
const CARD_LIST =
  'relative flex max-h-64 min-h-0 flex-1 flex-col gap-1 overflow-hidden lg:max-h-none';

function KanbanCard({ row }: Readonly<{ readonly row: HomeLoopRow }>) {
  const title = row.url ? (
    <a
      href={row.url}
      target='_blank'
      rel='noreferrer'
      className='line-clamp-2 text-primary-token hover:underline focus-visible:underline'
      title={row.title}
    >
      {row.title}
    </a>
  ) : (
    <span className='line-clamp-2 text-primary-token' title={row.title}>
      {row.title}
    </span>
  );
  return (
    <li
      data-fit-item
      data-attention={row.attention ?? 'none'}
      data-testid='home-loop-kanban-card'
      className={cn(
        'flex shrink-0 flex-col gap-0.5 rounded-md bg-surface-1 px-2 py-1.5 text-xs',
        row.attention && `border-l-2 ${ATTENTION_EDGE[row.attention]}`
      )}
    >
      {title}
      <span className='flex items-center justify-between gap-2 text-2xs text-tertiary-token'>
        <span className='truncate tabular-nums'>{row.identifier}</span>
        {row.attention ? (
          <span
            className={
              row.attention === 'blocked' ? 'text-error' : 'text-warning'
            }
          >
            {ATTENTION_LABEL[row.attention]}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function KanbanLane({
  stage,
  rows,
  moreHref,
}: Readonly<{
  readonly stage: string;
  readonly rows: readonly HomeLoopRow[];
  readonly moreHref?: string;
}>) {
  const { ref, hidden } = useFitList<HTMLUListElement>(
    rows.map(row => row.id).join('|')
  );
  const label = capitalizeFirst(stage);
  return (
    <section
      aria-label={`${label}: ${rows.length}`}
      className={LANE_FRAME}
      data-stage={stage}
      data-testid='home-loop-kanban-lane'
    >
      <h3 className='flex items-center justify-between gap-2 text-balance text-2xs font-medium text-secondary-token'>
        <span className='truncate'>{label}</span>
        <span className='tabular-nums text-primary-token'>{rows.length}</span>
      </h3>
      <ul ref={ref} className={CARD_LIST} data-testid='home-loop-kanban-cards'>
        {rows.map(row => (
          <KanbanCard key={row.id} row={row} />
        ))}
      </ul>
      <p className='h-4 shrink-0 text-2xs tabular-nums text-tertiary-token'>
        {hidden > 0 ? (
          moreHref ? (
            <a
              href={moreHref}
              className='hover:text-primary-token hover:underline focus-visible:underline'
              data-testid='home-loop-kanban-more'
            >
              {`+${hidden} more`}
            </a>
          ) : (
            <span data-testid='home-loop-kanban-more'>{`+${hidden} more`}</span>
          )
        ) : null}
      </p>
    </section>
  );
}

/**
 * In-flight work as one lane per stage. Lanes size to the space Home gives
 * them and show "+N more" rather than scrolling; attention (blocked,
 * failing, retrying) is named in text and marked on the card edge.
 */
export function HomeLoopKanban({
  stages,
  rows,
  moreHref,
}: Readonly<{
  readonly stages: readonly string[];
  readonly rows: readonly HomeLoopRow[];
  /** Where the full in-flight list lives when a lane overflows. */
  readonly moreHref?: string;
}>) {
  return (
    <div
      className='grid min-h-0 flex-1 grid-cols-2 gap-2 @2xl:grid-cols-3 @4xl:grid-cols-6 lg:grid-rows-1'
      data-testid='home-loop-kanban'
    >
      {stages.map(stage => (
        <KanbanLane
          key={stage}
          stage={stage}
          rows={rows.filter(row => row.stage === stage)}
          moreHref={moreHref}
        />
      ))}
    </div>
  );
}

const SKELETON_LANES = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] as const;

/** Same lane frames as the loaded board, so data arrival moves nothing. */
export function HomeLoopKanbanSkeleton() {
  return (
    <div className='grid min-h-0 flex-1 grid-cols-2 gap-2 @2xl:grid-cols-3 @4xl:grid-cols-6 lg:grid-rows-1'>
      {SKELETON_LANES.map(slot => (
        <div key={slot} className={LANE_FRAME}>
          <LoadingSkeleton height='h-3' width='w-1/2' />
          <LoadingSkeleton height='h-12' width='w-full' />
          <LoadingSkeleton height='h-12' width='w-full' />
        </div>
      ))}
    </div>
  );
}
