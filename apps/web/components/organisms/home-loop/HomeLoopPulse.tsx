'use client';

// @coverage-via apps/web/components/organisms/home-loop/HomeLoopParts.test.tsx

import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import type {
  HomeLoopConstraint,
  HomeLoopTile,
  HomeLoopTone,
} from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';
import { useFitList } from './useFitList';

const TONE_DOT: Record<HomeLoopTone, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-error',
  neutral: 'bg-subtle',
};

const TONE_LABEL: Record<HomeLoopTone, string> = {
  good: 'Healthy',
  warn: 'Needs attention',
  bad: 'Problem',
  neutral: 'No status',
};

const PLACEHOLDER_SLOTS = [
  'slot-1',
  'slot-2',
  'slot-3',
  'slot-4',
  'slot-5',
  'slot-6',
  'slot-7',
  'slot-8',
] as const;

const TILE_FRAME =
  'flex h-20 min-w-34 flex-1 basis-0 flex-col justify-between gap-0.5 rounded-lg bg-surface-1 px-3 py-2';

/** The single highest-severity condition; a quiet line when there is none. */
export function HomeLoopConstraintBanner({
  constraint,
  emptyLabel,
  loading = false,
}: Readonly<{
  readonly constraint: HomeLoopConstraint | null;
  readonly emptyLabel: string;
  readonly loading?: boolean;
}>) {
  const Icon = constraint
    ? constraint.tone === 'bad'
      ? CircleAlert
      : AlertTriangle
    : CheckCircle2;
  return (
    <div
      role='status'
      aria-live='polite'
      className='flex min-h-10 items-center gap-2 rounded-lg bg-surface-1 px-3 py-2 text-sm'
      data-testid='home-loop-constraint'
      data-tone={loading ? 'loading' : (constraint?.tone ?? 'clear')}
    >
      {loading ? (
        <LoadingSkeleton height='h-4' width='w-2/3' />
      ) : (
        <>
          <Icon
            aria-hidden='true'
            className={cn(
              'size-4 shrink-0',
              constraint
                ? constraint.tone === 'bad'
                  ? 'text-error'
                  : 'text-warning'
                : 'text-success'
            )}
          />
          <span
            className={cn(
              'min-w-0 truncate',
              constraint ? 'text-primary-token' : 'text-secondary-token'
            )}
          >
            {constraint ? constraint.text : emptyLabel}
          </span>
        </>
      )}
    </div>
  );
}

export function HomeLoopTileCard({
  tile,
}: Readonly<{ readonly tile: HomeLoopTile }>) {
  return (
    <div
      className={TILE_FRAME}
      data-fit-item
      data-measured={tile.measured}
      data-testid={`home-loop-tile-${tile.key}`}
      data-tone={tile.tone}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='truncate text-2xs text-tertiary-token'>
          {tile.label}
        </span>
        <span
          aria-label={TONE_LABEL[tile.tone]}
          className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tile.tone])}
          role='img'
        />
      </div>
      <span
        className={cn(
          'truncate font-semibold tabular-nums leading-tight',
          tile.measured
            ? 'text-xl text-primary-token'
            : 'text-sm text-tertiary-token'
        )}
      >
        {tile.value}
      </span>
      <span className='truncate text-2xs tabular-nums text-tertiary-token'>
        {tile.was ? `Was ${tile.was}` : '\u00a0'}
      </span>
    </div>
  );
}

/**
 * Metric tiles in one row: current value with the previous one underneath.
 * Tiles arrive in priority order; the row shows as many as fit the width
 * and hides the rest rather than wrapping or scrolling.
 */
export function HomeLoopPulse({
  tiles,
  loading = false,
  placeholderCount = 7,
}: Readonly<{
  readonly tiles: readonly HomeLoopTile[];
  readonly loading?: boolean;
  readonly placeholderCount?: number;
}>) {
  const { ref } = useFitList<HTMLDivElement>(
    loading
      ? 'loading'
      : tiles.map(tile => `${tile.key}:${tile.value}`).join('|')
  );
  return (
    <div
      ref={ref}
      className='relative flex h-20 shrink-0 flex-wrap gap-2 overflow-hidden'
      data-testid='home-loop-pulse'
      aria-busy={loading}
    >
      {loading || tiles.length === 0
        ? PLACEHOLDER_SLOTS.slice(0, placeholderCount).map(slot => (
            // Unavailable tiles keep their frames so nothing below moves.
            <div
              key={slot}
              className={TILE_FRAME}
              data-fit-item
              data-testid='home-loop-tile-placeholder'
            >
              {loading ? (
                <>
                  <LoadingSkeleton height='h-3' width='w-1/2' />
                  <LoadingSkeleton height='h-6' width='w-2/3' />
                  <LoadingSkeleton height='h-3' width='w-1/3' />
                </>
              ) : null}
            </div>
          ))
        : tiles.map(tile => <HomeLoopTileCard key={tile.key} tile={tile} />)}
    </div>
  );
}
