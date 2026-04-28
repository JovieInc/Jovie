'use client';

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
 * (color class, single-letter glyph, full label) so the component stays
 * generic — it has no opinion about which DSPs exist or what their brand
 * tokens are.
 */
export interface DspAvatarItem {
  readonly id: string;
  readonly status: DspStatus;
  readonly label: string;
  readonly glyph: string;
  /** Tailwind `bg-*` class used for the avatar fill at non-`missing` states. */
  readonly colorClass: string;
}

const STATUS_DOT: Record<DspStatus, string> = {
  live: 'bg-emerald-400',
  pending: 'bg-amber-400',
  error: 'bg-rose-500',
  missing: 'bg-quaternary-token/60',
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
 * (`colorClass`, `glyph`, `label`) per DSP so the component has no built-in
 * knowledge of specific DSPs.
 *
 * @example
 * ```tsx
 * <DspAvatarStack
 *   dsps={[
 *     { id: 'spotify', status: 'live', label: 'Spotify', glyph: 'S', colorClass: 'bg-emerald-500' },
 *     { id: 'apple', status: 'pending', label: 'Apple Music', glyph: 'A', colorClass: 'bg-rose-500' },
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
  if (dsps.length === 0) return null;

  const ordered = [...dsps].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]
  );
  const primary = ordered[0];
  const liveCount = ordered.filter(d => d.status === 'live').length;
  const others = Math.max(0, ordered.length - 1);

  return (
    <div
      className={cn(
        'relative inline-flex items-center gap-1.5 group/dsps',
        className
      )}
    >
      <span
        className={cn(
          'relative h-[20px] w-[20px] rounded-full grid place-items-center text-[9px] font-semibold text-white shrink-0',
          'ring-2 ring-(--linear-bg-page)',
          primary.status === 'missing'
            ? 'bg-quaternary-token/40 opacity-50'
            : primary.colorClass
        )}
      >
        {primary.glyph}
        {primary.status === 'pending' && (
          <span
            aria-hidden='true'
            className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 ring-1 ring-(--linear-bg-page)'
          />
        )}
        {primary.status === 'error' && (
          <span
            aria-hidden='true'
            className='absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-1 ring-(--linear-bg-page)'
          />
        )}
      </span>
      {others > 0 && (
        <span className='inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-caption tabular-nums text-tertiary-token bg-(--surface-1)/70 border border-(--linear-app-shell-border)'>
          +{others}
        </span>
      )}

      <div
        role='tooltip'
        className={cn(
          'pointer-events-none absolute right-0 top-full mt-1.5 z-40 w-[220px]',
          'opacity-0 translate-y-1 group-hover/dsps:opacity-100 group-hover/dsps:translate-y-0 group-hover/dsps:pointer-events-auto',
          'transition-[opacity,transform] duration-150 ease-out delay-[400ms] group-hover/dsps:delay-[400ms]'
        )}
      >
        <div className='rounded-md border border-(--linear-app-shell-border) bg-(--linear-app-content-surface)/95 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.32)] overflow-hidden'>
          <div className='flex items-center justify-between px-2.5 h-7 border-b border-(--linear-app-shell-border)/60'>
            <span className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
              Distribution
            </span>
            <span className='text-[10.5px] tabular-nums text-tertiary-token'>
              {liveCount}/{ordered.length} Live
            </span>
          </div>
          <div className='max-h-[180px] overflow-y-auto'>
            {ordered.map(dsp => (
              <div
                key={dsp.id}
                className='flex items-center gap-2 h-7 px-2.5 hover:bg-surface-1/40'
              >
                <span
                  className={cn(
                    'h-[14px] w-[14px] rounded-full grid place-items-center text-[8px] font-semibold text-white shrink-0',
                    dsp.status === 'missing'
                      ? 'bg-quaternary-token/40 opacity-60'
                      : dsp.colorClass
                  )}
                >
                  {dsp.glyph}
                </span>
                <span className='flex-1 text-[12px] text-secondary-token truncate'>
                  {dsp.label}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      STATUS_DOT[dsp.status]
                    )}
                  />
                  <span className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token'>
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
