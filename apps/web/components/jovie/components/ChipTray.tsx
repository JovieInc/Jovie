'use client';

import { X } from 'lucide-react';
import { skillById } from '@/lib/commands/registry';
import { cn } from '@/lib/utils';
import type { TrayChip } from '../hooks/useChipTray';
import { EntityChip } from './EntityChip';

interface ChipTrayProps {
  readonly chips: readonly TrayChip[];
  readonly onRemoveAt: (index: number) => void;
  readonly className?: string;
}

/**
 * Renders the input chip tray — skills as labeled pills, entity mentions as
 * EntityChip pills. Each chip has a small close button for explicit removal.
 * Backspace-on-empty-textarea removal is handled by the parent (ChatInput).
 */
export function ChipTray({ chips, onRemoveAt, className }: ChipTrayProps) {
  if (chips.length === 0) return null;
  return (
    <div
      data-testid='chat-input-chip-tray'
      className={cn('contents', className)}
    >
      {chips.map((chip, i) => {
        if (chip.type === 'skill') {
          const label = skillById(chip.id)?.label ?? chip.id;
          return (
            <span
              key={chip.uid}
              className='inline-flex h-7 max-w-[220px] shrink-0 items-center gap-1.5 rounded-[9px] border border-white/[0.085] bg-white/[0.035] px-2 text-[13px] font-medium leading-none text-primary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]'
              title={label}
            >
              <span
                aria-hidden
                className='h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary-token'
              />
              <span className='min-w-0 truncate'>{label}</span>
              <button
                type='button'
                aria-label={`Remove ${label} skill`}
                onMouseDown={e => {
                  e.preventDefault();
                }}
                onClick={() => {
                  onRemoveAt(i);
                }}
                className='-mr-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-colors duration-fast hover:bg-white/[0.07] hover:text-primary-token focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
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
