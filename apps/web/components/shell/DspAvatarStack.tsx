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
 * (brand color, SVG icon path, label, fallback glyph) so the component stays
 * generic — it has no opinion about which DSPs exist or what their brand
 * tokens are.
 *
 * Prefer `iconPath` (SVG brand mark) over `glyph` (text initial).
 * When `iconPath` is provided the component renders the SVG; otherwise
 * it falls back to the text glyph for backward compatibility.
 */
export interface DspAvatarItem {
  readonly id: string;
  readonly status: DspStatus;
  readonly label: string;
  /** Single-letter glyph used as fallback when `iconPath` is not provided. */
  readonly glyph: string;
  /** SVG `d` attribute for the brand icon. Preferred over `glyph`. */
  readonly iconPath?: string;
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
 * DspAvatarStack — stacked (overlapping) DSP avatars + "+N" overflow chip
 * with a hover popover listing every DSP and its status. `maxVisible`
 * controls how many avatars render before the overflow chip (default 1).
 *
 * Sorts the input so `live` DSPs lead, then `pending`/`error`, then `missing`
 * — the visible primary is always the most-actionable DSP. The popover
 * preserves the input order's stability across renders.
 *
 * **Color behavior:** Avatars render grey (surface-2 bg, quaternary-token icon)
 * at rest and transition to their brand color on hover. The brand color is a
 * reward for engagement, not the default state — consistent with Jovie's
 * restrained, expensive design philosophy.
 *
 * Pure presentational. The caller is expected to pre-define brand metadata
 * (`color`, `iconPath`, `glyph`, `label`) per DSP so the component has no
 * built-in knowledge of specific DSPs.
 *
 * @example
 * ```tsx
 * <DspAvatarStack
 *   dsps={[
 *     { id: 'spotify', status: 'live', label: 'Spotify', glyph: 'S', iconPath: SPOTIFY_PATH, color: SPOTIFY_BRAND_COLOR },
 *     { id: 'apple', status: 'pending', label: 'Apple Music', glyph: 'A', iconPath: APPLE_PATH, color: APPLE_BRAND_COLOR },
 *   ]}
 * />
 * ```
 */
export function DspAvatarStack({
  dsps,
  className,
  maxVisible = 1,
}: {
  readonly dsps: readonly DspAvatarItem[];
  readonly className?: string;
  /**
   * How many overlapping DSP avatars to show before collapsing the rest into
   * the "+N" chip. Defaults to 1 (single primary avatar), the original shape.
   */
  readonly maxVisible?: number;
}) {
  const popoverId = useId();

  if (dsps.length === 0) return null;

  const ordered = [...dsps].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]
  );
  const liveCount = ordered.filter(d => d.status === 'live').length;
  const visible = ordered.slice(0, Math.max(1, maxVisible));
  const others = Math.max(0, ordered.length - visible.length);

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
        <span className='inline-flex items-center'>
          {visible.map((dsp, index) => (
            <span
              key={dsp.id}
              className={cn(
                'relative grid h-5 w-5 shrink-0 place-items-center rounded-full',
                'bg-surface-2 text-quaternary-token',
                'ring-2 ring-(--system-b-bg-page)',
                'transition-colors duration-subtle ease-subtle',
                // Brand text color on hover applies only to SVG icon avatars —
                // glyph-only avatars keep white text so the glyph stays visible
                // against its brand-colored background.
                dsp.iconPath &&
                  'group-hover/dsps:text-(--system-b-dsp-avatar-color) group-focus-within/dsps:text-(--system-b-dsp-avatar-color)',
                index > 0 && '-ml-1.5',
                dsp.status === 'missing' && 'opacity-40',
                !dsp.iconPath &&
                  'font-semibold text-white dark:text-white bg-(--system-b-dsp-avatar-color)',
                // opacity-75 must not apply to 'missing' glyph avatars — it wins
                // the tailwind-merge conflict against opacity-40 and erases the
                // faded missing state.
                !dsp.iconPath &&
                  dsp.status !== 'missing' &&
                  'opacity-75 group-hover/dsps:opacity-95 group-focus-within/dsps:opacity-95'
              )}
              style={
                {
                  '--system-b-dsp-avatar-color': dsp.color,
                  '--system-b-dsp-icon-color': dsp.color,
                  '--system-b-dsp-hover-bg': `color-mix(in oklab, ${dsp.color} 10%, transparent)`,
                  zIndex: visible.length - index,
                } as CSSProperties
              }
            >
              {/* Brand-tinted overlay on hover — visible only when the parent group is hovered */}
              {dsp.iconPath && (
                <span
                  className={cn(
                    'absolute inset-0 rounded-full opacity-0',
                    'transition-opacity duration-subtle ease-subtle',
                    'group-hover/dsps:opacity-100 group-focus-within/dsps:opacity-100'
                  )}
                  style={{
                    backgroundColor: `color-mix(in oklab, ${dsp.color} 10%, transparent)`,
                  }}
                  aria-hidden='true'
                />
              )}
              {dsp.iconPath ? (
                <svg
                  viewBox='0 0 24 24'
                  fill='currentColor'
                  aria-hidden='true'
                  className='relative z-10 h-3 w-3'
                >
                  <path d={dsp.iconPath} />
                </svg>
              ) : (
                <span className='relative z-10 text-3xs'>{dsp.glyph}</span>
              )}
              {dsp.status === 'pending' && (
                <span
                  aria-hidden='true'
                  className='system-b-dsp-status-dot system-b-dsp-status-dot-pending absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-(--system-b-bg-page)'
                />
              )}
              {dsp.status === 'error' && (
                <span
                  aria-hidden='true'
                  className='system-b-dsp-status-dot system-b-dsp-status-dot-error absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-(--system-b-bg-page)'
                />
              )}
            </span>
          ))}
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
                    'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full',
                    'bg-(--system-b-dsp-avatar-color) text-white dark:text-white',
                    dsp.status === 'missing' ? 'opacity-45' : 'opacity-90'
                  )}
                  style={
                    {
                      '--system-b-dsp-avatar-color': dsp.color,
                    } as CSSProperties
                  }
                >
                  {dsp.iconPath ? (
                    <svg
                      viewBox='0 0 24 24'
                      fill='currentColor'
                      aria-hidden='true'
                      className='h-2.5 w-2.5'
                    >
                      <path d={dsp.iconPath} />
                    </svg>
                  ) : (
                    <span className='text-3xs'>{dsp.glyph}</span>
                  )}
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
