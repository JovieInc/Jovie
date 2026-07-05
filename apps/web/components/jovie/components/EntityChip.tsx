'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { type CSSProperties } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import { ENTITY_KIND_ACCENT_VAR } from './entity-accent';

export interface EntityChipData {
  readonly kind: EntityKind;
  readonly id: string;
  readonly label: string;
  readonly thumbnail?: string;
}

export type EntityChipTone = 'onLight' | 'onDark';

interface EntityChipProps {
  readonly data: EntityChipData;
  readonly variant?: 'input' | 'transcript';
  /**
   * Surface the chip renders on. `onDark` (default) matches the dark composer
   * tray and assistant transcript. `onLight` matches the white user-message
   * bubble. Tone drives bg/border/text mixing so a release chip stays
   * accent-tinted but readable on whichever surface it lands on.
   */
  readonly tone?: EntityChipTone;
  /** Marks chip atomic for contenteditable: sets contentEditable="false" + data attributes so input handlers can detect it. */
  readonly isInputChip?: boolean;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
}

const KIND_PREFIX: Record<EntityKind, string> = {
  release: 'Release',
  artist: 'Artist',
  track: 'Track',
  event: 'Event',
};

/**
 * Non-interactive presentational chip primitive. Interaction (click, popover,
 * keyboard activation) is the wrapper's job — wrapping `EntityChip` in
 * `PopoverTrigger asChild` or another button is how the chip becomes
 * actionable. This split exists so the chip can be safely composed inside
 * triggers without creating nested interactive elements.
 */
export function EntityChip({
  data,
  variant = 'input',
  tone = 'onDark',
  isInputChip = false,
  onRemove,
  removeLabel,
}: EntityChipProps) {
  const prefix = KIND_PREFIX[data.kind];
  const inputChipAttributes = isInputChip
    ? {
        contentEditable: false,
        'data-entity-chip': 'true',
        'data-entity-kind': data.kind,
        'data-entity-id': data.id,
        'data-entity-label': data.label,
      }
    : {};
  const accentStyle = {
    '--jovie-entity-accent': `var(${ENTITY_KIND_ACCENT_VAR[data.kind]})`,
  } as CSSProperties;

  const commonClassName = 'system-b-entity-chip';

  const thumbSize = variant === 'transcript' ? 16 : 14;

  return (
    <span
      {...inputChipAttributes}
      className={commonClassName}
      style={accentStyle}
      data-testid='entity-chip'
      data-entity-kind={data.kind}
      data-entity-tone={tone}
      data-entity-variant={variant}
      title={`${prefix}: ${data.label}`}
    >
      {data.thumbnail ? (
        <Image
          src={data.thumbnail}
          alt=''
          width={thumbSize}
          height={thumbSize}
          className='system-b-entity-chip-thumbnail'
          aria-hidden
        />
      ) : (
        <span aria-hidden className='system-b-entity-chip-dot' />
      )}
      <span className='min-w-0 truncate'>{data.label}</span>
      {onRemove ? (
        <button
          type='button'
          aria-label={removeLabel ?? `Remove ${data.label}`}
          onMouseDown={event => {
            event.preventDefault();
          }}
          onClick={event => {
            event.preventDefault();
            onRemove();
          }}
          className='system-b-entity-chip-remove'
        >
          <X className='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
