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
      className='system-b-skill-chip'
      title={label}
      data-testid='skill-chip'
    >
      <span aria-hidden className='system-b-skill-chip-dot' />
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
          className='system-b-skill-chip-remove'
        >
          <X className='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
