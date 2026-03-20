'use client';

import { Badge } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/formatDuration';

type TrackMetaSummaryVariant = 'compact' | 'drawer';

export interface TrackMetaSummaryProps {
  readonly title: string;
  readonly trackNumber: number;
  readonly discNumber: number;
  readonly durationMs: number | null;
  readonly isrc?: string | null;
  readonly isExplicit?: boolean;
  readonly artwork?: ReactNode;
  readonly variant?: TrackMetaSummaryVariant;
  readonly className?: string;
}

const VARIANT_STYLES: Record<
  TrackMetaSummaryVariant,
  {
    container: string;
    number: string;
    title: string;
    meta: string;
  }
> = {
  compact: {
    container: 'space-y-1',
    number: 'text-[11px]',
    title: 'text-[12px]',
    meta: 'text-[11px]',
  },
  drawer: {
    container: 'space-y-1',
    number: 'text-[11px]',
    title: 'text-[13px]',
    meta: 'text-[11px]',
  },
};

export function TrackMetaSummary({
  title,
  trackNumber,
  discNumber,
  durationMs,
  isrc,
  isExplicit = false,
  artwork,
  variant = 'compact',
  className,
}: TrackMetaSummaryProps) {
  const styles = VARIANT_STYLES[variant];
  const trackLabel =
    discNumber > 1 ? `${discNumber}-${trackNumber}` : String(trackNumber);

  return (
    <div
      className={cn(
        artwork ? 'flex items-start gap-3' : styles.container,
        className
      )}
    >
      <div className={cn('min-w-0 flex-1', styles.container)}>
        <div className='flex items-center gap-2'>
          <span
            className={cn('tabular-nums text-tertiary-token', styles.number)}
          >
            {trackLabel}.
          </span>
          <h3
            className={cn(
              'min-w-0 truncate font-[590] text-primary-token',
              styles.title
            )}
          >
            {title}
          </h3>
          {isExplicit ? (
            <Badge
              variant='secondary'
              className='shrink-0 rounded-md bg-surface-1 px-1.5 py-0 text-[9px] font-[510] text-tertiary-token'
            >
              E
            </Badge>
          ) : null}
        </div>

        {durationMs != null || isrc ? (
          <div
            className={cn(
              'flex items-center gap-2 text-secondary-token',
              styles.meta
            )}
          >
            {durationMs != null && (
              <span className='tabular-nums'>{formatDuration(durationMs)}</span>
            )}
            {isrc ? (
              <span className='font-mono text-[9.5px] tracking-[0.02em] text-tertiary-token'>
                {isrc}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {artwork ?? null}
    </div>
  );
}
