'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActivityHoverRowProps {
  /** Lucide icon component rendered on the left. */
  readonly icon: LucideIcon;
  /** Primary row label (truncates if it overflows). */
  readonly label: string;
  /** Right-aligned uppercase meta caption (e.g. timestamp, count). */
  readonly meta: string;
  readonly onClick?: () => void;
  /**
   * When true, surfaces a small cyan "still happening" dot between the
   * label and the meta caption. Uses the global `.anim-calm-breath`
   * utility so motion stays subliminal.
   */
  readonly running?: boolean;
  /** Tints the leading icon cyan (e.g. for AI-driven activity). */
  readonly iconAccent?: boolean;
  /** Render in the destructive tone — used for delete-like activity entries. */
  readonly danger?: boolean;
  readonly className?: string;
}

/**
 * ActivityHoverRow — single row inside an entity drawer's Activity tab.
 * Compact 32px tall, icon + label + meta + optional running indicator.
 * Hover lifts the surface; danger tone swaps to a rose-tinted hover.
 *
 * @example
 * ```tsx
 * <ActivityHoverRow
 *   icon={Sparkles}
 *   label='Spotify Canvas regenerated'
 *   meta='2m ago'
 *   iconAccent
 *   running
 *   onClick={() => openActivity(id)}
 * />
 * ```
 */
export function ActivityHoverRow({
  icon: Icon,
  label,
  meta,
  onClick,
  running,
  iconAccent,
  danger,
  className,
}: ActivityHoverRowProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'group/act flex items-center gap-2.5 h-8 px-2 rounded-md text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
        danger
          ? 'text-rose-300/85 hover:bg-rose-500/10 hover:text-rose-200'
          : 'text-secondary-token hover:bg-surface-1/50 hover:text-primary-token',
        className
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          iconAccent ? 'text-cyan-300/85' : 'text-quaternary-token'
        )}
        strokeWidth={2.25}
      />
      <span className='flex-1 text-left truncate'>{label}</span>
      {running && (
        <span
          aria-hidden='true'
          className='h-1.5 w-1.5 rounded-full bg-cyan-300/80 anim-calm-breath'
        />
      )}
      <span className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token group-hover/act:text-tertiary-token transition-colors duration-150 ease-out'>
        {meta}
      </span>
    </button>
  );
}
