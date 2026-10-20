import { Check } from 'lucide-react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import type {
  HomeLoopAttention,
  HomeLoopDoneItem,
  HomeLoopRow,
} from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';

const ATTENTION_LABEL: Record<Exclude<HomeLoopAttention, null>, string> = {
  blocked: 'Blocked',
  failing: 'Failing',
  retrying: 'Retrying',
};

const ROW_FRAME =
  'flex min-h-10 flex-col gap-1 border-t border-subtle py-2 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3';

/** Pips show completed, current, and pending stages; text names the stage. */
export function HomeLoopStagePips({
  stages,
  row,
}: Readonly<{
  readonly stages: readonly string[];
  readonly row: Pick<
    HomeLoopRow,
    'stage' | 'stageIndex' | 'complete' | 'attention'
  >;
}>) {
  const stageLabel = capitalizeFirst(row.stage);
  const attention = row.attention ? ATTENTION_LABEL[row.attention] : null;
  return (
    <div className='flex items-center gap-2'>
      <ol
        aria-label={`Stage ${row.stageIndex + 1} of ${stages.length}: ${stageLabel}${attention ? `, ${attention}` : ''}`}
        className='flex items-center gap-0.5'
      >
        {stages.map((stage, index) => {
          const done =
            index < row.stageIndex ||
            (row.complete && index === row.stageIndex);
          const current = index === row.stageIndex && !row.complete;
          return (
            <li
              key={stage}
              aria-hidden='true'
              className={cn(
                'h-1.5 w-5 rounded-full',
                done
                  ? 'bg-accent-blue'
                  : current
                    ? row.attention === 'blocked'
                      ? 'bg-error'
                      : row.attention
                        ? 'bg-warning'
                        : 'bg-accent-blue ring-2 ring-accent-blue/30'
                    : 'bg-subtle'
              )}
              data-pip={done ? 'done' : current ? 'current' : 'pending'}
            />
          );
        })}
      </ol>
      <span
        className={cn(
          'w-24 truncate text-right text-2xs',
          row.attention === 'blocked'
            ? 'text-error'
            : row.attention
              ? 'text-warning'
              : 'text-tertiary-token'
        )}
      >
        {attention ?? stageLabel}
      </span>
    </div>
  );
}

export function HomeLoopStageRows({
  stages,
  rows,
  maxRows = 12,
}: Readonly<{
  readonly stages: readonly string[];
  readonly rows: readonly HomeLoopRow[];
  readonly maxRows?: number;
}>) {
  const visible = rows.slice(0, maxRows);
  const hidden = rows.length - visible.length;
  return (
    <div className='rounded-lg border border-subtle bg-surface-1 px-3'>
      <ul data-testid='home-loop-stage-rows'>
        {visible.map(row => (
          <li
            key={row.id}
            className={ROW_FRAME}
            data-attention={row.attention ?? 'none'}
            data-stage={row.stage}
            data-testid='home-loop-stage-row'
          >
            <div className='flex min-w-0 items-baseline gap-2 text-xs'>
              <span className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
                {row.identifier}
              </span>
              {row.url ? (
                <a
                  href={row.url}
                  target='_blank'
                  rel='noreferrer'
                  className='truncate text-primary-token hover:underline focus-visible:underline'
                  title={row.title}
                >
                  {row.title}
                </a>
              ) : (
                <span className='truncate text-primary-token' title={row.title}>
                  {row.title}
                </span>
              )}
            </div>
            <HomeLoopStagePips stages={stages} row={row} />
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className='border-t border-subtle py-2 text-2xs tabular-nums text-tertiary-token'>
          {`${hidden} more in flight`}
        </p>
      ) : null}
      <p className='border-t border-subtle py-1.5 text-2xs text-tertiary-token'>
        {stages.map(capitalizeFirst).join(' → ')}
      </p>
    </div>
  );
}

export function HomeLoopStageRowsSkeleton({
  rows = 4,
}: Readonly<{ readonly rows?: number }>) {
  return (
    <div className='rounded-lg border border-subtle bg-surface-1 px-3'>
      {SKELETON_ROWS.slice(0, rows).map(slot => (
        <div key={slot} className={ROW_FRAME}>
          <LoadingSkeleton height='h-3' width='w-3/5' />
          <LoadingSkeleton height='h-2' width='w-40' />
        </div>
      ))}
    </div>
  );
}

const SKELETON_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] as const;

/** Compact chips for work that landed today. */
export function HomeLoopDoneChips({
  items,
  summary,
}: Readonly<{
  readonly items: readonly HomeLoopDoneItem[];
  /** Optional aggregate, e.g. "12 merges", shown as the first chip. */
  readonly summary?: string | null;
}>) {
  return (
    <ul className='flex flex-wrap gap-1.5' data-testid='home-loop-done'>
      {summary ? (
        <li className='inline-flex min-h-7 items-center rounded-full border border-subtle px-2 text-xs font-medium tabular-nums text-primary-token'>
          {summary}
        </li>
      ) : null}
      {items.map(item => (
        <li
          key={item.id}
          className='inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-2 text-xs text-secondary-token'
          data-verified={item.verified}
        >
          <Check
            aria-hidden='true'
            className={cn(
              'size-3 shrink-0',
              item.verified ? 'text-success' : 'text-tertiary-token'
            )}
          />
          {item.url ? (
            <a
              href={item.url}
              target='_blank'
              rel='noreferrer'
              className='truncate hover:text-primary-token focus-visible:underline'
            >
              {item.label}
            </a>
          ) : (
            <span className='truncate'>{item.label}</span>
          )}
          <span className='sr-only'>
            {item.verified ? 'Verified in production' : 'Landed'}
          </span>
        </li>
      ))}
    </ul>
  );
}
