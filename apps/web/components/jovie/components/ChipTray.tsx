'use client';

import { X } from 'lucide-react';
import type { TrayChip } from '../hooks/useChipTray';
import { EntityChip } from './EntityChip';

interface ChipTrayProps {
  readonly chips: readonly TrayChip[];
  readonly onRemoveAt: (index: number) => void;
}

/**
 * Renders the input chip tray — skills as labeled pills, entity mentions as
 * EntityChip pills. Each chip has a small close button for explicit removal.
 * Backspace-on-empty-textarea removal is handled by the parent (ChatInput).
 */
export function ChipTray({ chips, onRemoveAt }: ChipTrayProps) {
  if (chips.length === 0) return null;
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {chips.map((chip, i) => {
        if (chip.type === 'skill') {
          return (
            <span
              key={chip.uid}
              className='inline-flex items-center gap-1 rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-xs font-medium text-secondary-token'
            >
              <span>/{chip.id}</span>
              <button
                type='button'
                aria-label={`Remove ${chip.id} skill`}
                onMouseDown={e => {
                  e.preventDefault();
                  onRemoveAt(i);
                }}
                className='inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-tertiary-token hover:bg-surface-1 hover:text-primary-token focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
              >
                <X className='h-3 w-3' />
              </button>
            </span>
          );
        }
        return (
          <EntityChip
            key={chip.uid}
            data={chip}
            variant='input'
            onRemove={() => onRemoveAt(i)}
            removeLabel={`Remove ${chip.label}`}
          />
        );
      })}
    </div>
  );
}
