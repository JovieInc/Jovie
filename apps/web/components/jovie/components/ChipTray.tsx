'use client';

import { skillById } from '@/lib/commands/registry';
import { cn } from '@/lib/utils';
import type { TrayChip } from '../hooks/useChipTray';
import { EntityChip } from './EntityChip';
import { SkillChip } from './SkillChip';

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
            <SkillChip
              key={chip.uid}
              label={label}
              onRemove={() => onRemoveAt(i)}
            />
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
