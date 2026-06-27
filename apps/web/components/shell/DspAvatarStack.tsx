'use client';

import { type CSSProperties, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Per-DSP availability status surfaced by `DspAvatarStack`.
 *
 * - `live` — track is live on the DSP (default green dot).
 * - `pending` — distribution submitted, not yet visible (amber dot, pending corner badge).
 * - `error` — distribution failed (rose dot, error corner badge).
 * - `missing` — track was never sent to this DSP (faded primary, no corner badge).
 */
export type DspStatus = 'live' | 'pending' | 'error' | 'missing';

/**
 * One DSP entry passed to `DspAvatarStack`. Caller owns the brand metadata
 * (brand color, single-letter glyph, full label) so the component stays
 * generic — it has no opinion about which DSPs exist or what their brand
 * tokens are.
 */
export interface DspAvatarItem {
  readonly id: string;
  readonly status: DspStatus;
  readonly label: string;
  readonly glyph: string;
  /** Canonical DSP brand color. Missing states render this muted. */
  readonly color: string;
}

const STATUS_DOT: Record<DspStatus, string> = {
  live: 'system-b-dsp-status-dot-live',
  pending: 'system-b-dsp-status-dot-pending',
  error: 'system-b-dsp-status-dot-error',
  missing: 'system-b-dsp-status-dot-missing',
};

const STATUS_RANK: Record<DspStatus, number> = {
  live: 0,
  pending: 1,
  error: 1,
  missing: 2,
};

const STATUS_LABEL: Record<DspStatus, string> = {
  live: 'Live',
  pending: 'Pending',
  error: 'Error',
  missing: 'Missing',
};

/**
 * DspAvatarStack — single primary DSP avatar + "+N" overflow chip with a
 * hover popover listing every DSP and its status.
 *
 * Sorts the input so `live` DSPs lead, then `pending`/`error`, then `missing`
 * — the visible primary is always the most-actionable DSP. The popover
 * preserves the input order's stability across renders.
 *
 * Pure presentational. The caller is expected to pre-define brand metadata
 * (`color`, `glyph`, `label`) per DSP so the component has no built-in
 * knowledge of specific DSPs.
 *
 * @example
 * ```tsx
 * <DspAvatarStack
 *   dsps={[
 *     { id: 'spotify', status: 'live', label: 'Spotify', glyph: 'S', color: DSP_CONFIGS.spotify.color },
 *     { id: 'apple', status: 'pending', label: 'Apple Music', glyph: 'A', color: DSP_CONFIGS.apple_music.color },
 *   ]}
 * />
 * ```
 */
export function DspAvatarStack({
  dsps,
  className,
}: {
  readonly dsps: readonly DspAvatarItem[];
  readonly className?: string;
}) {
  const popoverId = useId();

  if (dsps.length === 0) return null;

  const ordered = [...dsps].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]
  );
  const primary = ordered[0];
  const liveCount = ordered.filter(d => d.status === 'live').length;
  const others = Math.max(0, ordered.length - 1);
  const primaryAvatarStyle = {
    '--system-b-dsp-avatar-color': primary.color,
  } as CSSProperties;

  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-1.5 group/dsps',
        className
      )}
    >
      <button
        aria-describedby={popoverId}
        aria-label='View DSP Distribution Details'
        className='inline-flex items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-(--system-b-bg-page)'
        type='button'
      >
        <span
          className={cn(
            'relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-(--system-b-dsp-avatar-color) text-3xs font-semibold text-white dark:text-white',
            'ring-2 ring-(--system-b-bg-page)',
            primary.status === 'missing'
              ? 'opacity-40'
              : 'opacity-75 transition-opacity duration-fast ease-subtle group-hover/dsps:opacity-95 group-focus-within/dsps:opacity-95'
          )}
          style={primaryAvatarStyle}
        >
          {primary.glyph}
          {primary.status === 'pending' && (
            <span
              aria-hidden='true'
              className='system-b-dsp-status-dot system-b-dsp-status-dot-pending absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-(--system-b-bg-page)'
            />
          )}
          {primary.status === 'error' && (
            <span
              aria-hidden='true'
              className='system-b-dsp-status-dot system-b-dsp-status-dot-error absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-(--system-b-bg-page)'
            />
          )}
        </span>
        {others > 0 && (
          <span className='inline-flex h-5 items-center rounded-full border border-(--system-b-app-shell-border) bg-surface-1 px-1.5 text-3xs font-caption tabular-nums text-tertiary-token'>
            +{others}
          </span>
        )}
      </button>

      <div
        id={popoverId}
        role='tooltip'
        className={cn(
          'system-b-dsp-avatar-stack-popover pointer-events-none absolute right-0 top-full mt-1.5 w-56',
          'opacity-0 group-hover/dsps:opacity-100 group-hover/dsps:pointer-events-auto group-focus-within/dsps:opacity-100 group-focus-within/dsps:pointer-events-auto',
          'transition-[opacity] duration-fast ease-subtle delay-[400ms] group-hover/dsps:delay-[400ms] group-focus-within/dsps:delay-0'
        )}
      >
        <div className='overflow-hidden rounded-xl border border-(--system-b-app-shell-border) bg-(--system-b-app-content-surface) shadow-popover backdrop-blur-xl'>
          <div className='flex h-7 items-center justify-between border-b border-(--system-b-app-shell-border) px-2.5'>
            <span className='text-3xs font-semibold text-quaternary-token'>
              Distribution
            </span>
            <span className='text-3xs tabular-nums text-tertiary-token'>
              {liveCount}/{ordered.length} Live
            </span>
          </div>
          <div className='max-h-44 overflow-y-auto'>
            {ordered.map(dsp => (
              <div
                key={dsp.id}
                className='flex h-7 items-center gap-2 px-2.5 hover:bg-surface-1'
              >
                <span
                  className={cn(
                    'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-(--system-b-dsp-avatar-color) text-3xs font-semibold text-white dark:text-white',
                    dsp.status === 'missing' ? 'opacity-45' : 'opacity-90'
                  )}
                  style={
                    {
                      '--system-b-dsp-avatar-color': dsp.color,
                    } as CSSProperties
                  }
                >
                  {dsp.glyph}
                </span>
                <span className='min-w-0 flex-1 truncate text-xs text-secondary-token'>
                  {dsp.label}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <span
                    className={cn(
                      'system-b-dsp-status-dot h-1.5 w-1.5 rounded-full',
                      STATUS_DOT[dsp.status]
                    )}
                  />
                  <span className='text-3xs text-quaternary-token'>
                    {STATUS_LABEL[dsp.status]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
