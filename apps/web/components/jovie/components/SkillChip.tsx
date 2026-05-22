'use client';

import { X } from 'lucide-react';

/**
 * Compact input-chip for slash skill invocations. Visually mirrors
 * `EntityChip` (input variant) — same h-7 pill shape, same close-button
 * affordance — but uses a neutral accent because skills aren't kind-tagged
 * the way entities are.
 *
 * Extracted out of `ChipTray` so a future styling change to chips touches
 * one place rather than two near-identical blocks.
 */
interface SkillChipProps {
  readonly label: string;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
}

export function SkillChip({ label, onRemove, removeLabel }: SkillChipProps) {
  return (
    <span
      className='inline-flex h-7 max-w-[220px] shrink-0 items-center gap-1.5 rounded-[9px] border border-white/[0.085] bg-white/[0.035] px-2 text-[13px] font-medium leading-none text-primary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] select-none'
      title={label}
      data-testid='skill-chip'
    >
      <span
        aria-hidden
        className='h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary-token'
      />
      <span className='min-w-0 truncate'>{label}</span>
      {onRemove ? (
        <button
          type='button'
          aria-label={removeLabel ?? `Remove ${label} skill`}
          onMouseDown={event => {
            event.preventDefault();
          }}
          onClick={() => {
            onRemove();
          }}
          className='-mr-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-colors duration-fast hover:bg-white/[0.07] hover:text-primary-token focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
        >
          <X className='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
