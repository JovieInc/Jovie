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
              className='inline-flex items-center gap-1 rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 text-[12px] font-medium text-secondary-token'
            >
              <span>/{chip.id}</span>
              <button
                type='button'
                aria-label={`Remove ${chip.id} skill`}
                onMouseDown={e => {
                  e.preventDefault();
                  onRemoveAt(i);
                }}
                className='inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
              >
                <X className='h-3 w-3' />
              </button>
            </span>
          );
        }
        return (
          <span key={chip.uid} className='relative'>
            <EntityChip data={chip} variant='input' />
            <button
              type='button'
              aria-label={`Remove ${chip.label}`}
              onMouseDown={e => {
                e.preventDefault();
                onRemoveAt(i);
              }}
              className='absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-2 text-tertiary-token shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-surface-1 hover:text-primary-token'
            >
              <X className='h-2.5 w-2.5' />
            </button>
          </span>
        );
      })}
    </div>
  );
}
