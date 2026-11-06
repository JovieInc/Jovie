export interface StatTileProps {
  readonly label: string;
  /** Measured value; omitted or empty falls back to the not-measured state. */
  readonly value?: string;
  readonly hint?: string;
  /** Loading reserves the slot; not-measured names an unwired source. */
  readonly state?: 'value' | 'loading' | 'not-measured';
  /** Names the source that will measure this stat (surfaced when not measured). */
  readonly notMeasuredSource?: string;
}

/** Ovie HUD copy: never blank, never an em dash. */
export const STAT_TILE_NOT_MEASURED_LABEL = 'Not measured';

function notMeasuredTitle(notMeasuredSource?: string): string {
  return notMeasuredSource
    ? `Not measured yet — waiting on ${notMeasuredSource}`
    : 'Not measured yet';
}

export function StatTile({
  label,
  value,
  hint,
  state,
  notMeasuredSource,
}: StatTileProps) {
  const resolvedState: 'value' | 'loading' | 'not-measured' =
    state === 'loading'
      ? 'loading'
      : state === 'not-measured' || !value?.trim()
        ? 'not-measured'
        : 'value';

  return (
    <div data-slot='stat-tile' className='space-y-0.5'>
      <p className='text-2xs font-caption tracking-normal text-secondary-token'>
        {label}
      </p>
      {resolvedState === 'loading' ? (
        <p
          data-state='loading'
          data-testid='stat-tile-value'
          aria-busy='true'
          className='leading-none'
        >
          <span className='sr-only'>Loading</span>
          <span
            aria-hidden='true'
            className='block h-3 w-16 animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none'
          />
        </p>
      ) : resolvedState === 'not-measured' ? (
        <p
          data-state='not-measured'
          data-testid='stat-tile-value'
          title={notMeasuredTitle(notMeasuredSource)}
          className='tabular-nums text-sm font-medium leading-none tracking-tight text-tertiary-token'
        >
          {STAT_TILE_NOT_MEASURED_LABEL}
        </p>
      ) : (
        <p
          data-state='value'
          data-testid='stat-tile-value'
          className='tabular-nums text-sm font-semibold leading-none tracking-tighter text-primary-token'
        >
          {value}
        </p>
      )}
      {hint && <p className='text-3xs text-tertiary-token'>{hint}</p>}
    </div>
  );
}
