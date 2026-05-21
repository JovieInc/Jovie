'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { type CSSProperties } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import { cn } from '@/lib/utils';

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

const KIND_ACCENT_VAR: Record<EntityKind, string> = {
  release: '--geist-purple-solid',
  artist: '--geist-blue-solid',
  track: '--geist-pink-solid',
  event: '--geist-green-solid',
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
    '--jovie-entity-accent': `var(${KIND_ACCENT_VAR[data.kind]})`,
  } as CSSProperties;

  const transcriptOnDark =
    'rounded-md border px-1.5 py-0.5 leading-5 border-[color:color-mix(in_srgb,var(--jovie-entity-accent)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--jovie-entity-accent)_11%,transparent)] text-[color:color-mix(in_srgb,var(--jovie-entity-accent)_70%,white_30%)]';

  // onLight: neutral text matching the user-bubble body color, with the
  // saturated brand color living in the thumbnail/dot/border. Decided as
  // Option B at plan gate so contrast stays consistent across all four
  // kinds (purple/blue/pink/green) on white.
  const transcriptOnLight =
    'rounded-md border px-1.5 py-0.5 leading-5 border-[color:color-mix(in_srgb,var(--jovie-entity-accent)_30%,white)] bg-[color:color-mix(in_srgb,var(--jovie-entity-accent)_8%,white)] text-[#111216]';

  const inputBase =
    'h-7 max-w-[220px] shrink-0 cursor-default rounded-[9px] border border-[color:color-mix(in_srgb,var(--jovie-entity-accent)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--jovie-entity-accent)_13%,transparent)] px-2 text-[13px] font-medium leading-none text-[color:color-mix(in_srgb,var(--jovie-entity-accent)_72%,white_28%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]';

  const commonClassName = cn(
    'inline-flex items-center gap-1.5 align-baseline select-none',
    variant === 'input' && inputBase,
    variant === 'transcript' &&
      (tone === 'onLight' ? transcriptOnLight : transcriptOnDark)
  );

  const thumbSize = variant === 'transcript' ? 16 : 14;
  const thumbClassName =
    variant === 'transcript'
      ? 'h-4 w-4 rounded-sm object-cover shrink-0'
      : 'h-3.5 w-3.5 rounded-sm object-cover shrink-0';

  // Slightly larger dot for the transcript variant — 8px solid + soft halo so
  // the chip still reads as a kind-tagged token even without artwork.
  const dotClassName =
    variant === 'transcript'
      ? 'inline-block h-2 w-2 rounded-full shrink-0 bg-[var(--jovie-entity-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--jovie-entity-accent)_18%,transparent)]'
      : 'inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--jovie-entity-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--jovie-entity-accent)_12%,transparent)]';

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
          className={thumbClassName}
          aria-hidden
        />
      ) : (
        <span aria-hidden className={dotClassName} />
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
          className='-mr-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-tertiary-token transition-colors duration-fast hover:bg-white/[0.07] hover:text-primary-token focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30'
        >
          <X className='h-3 w-3' />
        </button>
      ) : null}
    </span>
  );
}
