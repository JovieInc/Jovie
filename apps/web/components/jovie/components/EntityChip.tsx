'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { type CSSProperties, useMemo } from 'react';
import { useOptionalChatEntityPanel } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import type { EntityKind } from '@/lib/chat/tokens';
import { useAppFlag } from '@/lib/flags/client';
import { cn } from '@/lib/utils';

export interface EntityChipData {
  readonly kind: EntityKind;
  readonly id: string;
  readonly label: string;
  readonly thumbnail?: string;
}

interface EntityChipProps {
  readonly data: EntityChipData;
  readonly variant?: 'input' | 'transcript';
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

export function EntityChip({
  data,
  variant = 'input',
  isInputChip = false,
  onRemove,
  removeLabel,
}: EntityChipProps) {
  const prefix = KIND_PREFIX[data.kind];
  const designV1ChatEntitiesEnabled = useAppFlag('DESIGN_V1');
  const entityPanel = useOptionalChatEntityPanel();
  const canOpenEntityPanel =
    designV1ChatEntitiesEnabled &&
    variant === 'transcript' &&
    data.kind === 'release' &&
    entityPanel !== null;
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
  const commonClassName = cn(
    'inline-flex items-center gap-1.5 align-baseline text-primary-token select-none',
    variant === 'input'
      ? 'h-7 max-w-[220px] shrink-0 cursor-default rounded-[9px] border border-[color:color-mix(in_srgb,var(--jovie-entity-accent)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--jovie-entity-accent)_13%,transparent)] px-2 text-[13px] font-medium leading-none text-[color:color-mix(in_srgb,var(--jovie-entity-accent)_72%,white_28%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]'
      : 'rounded-md border border-subtle bg-surface-0 px-1.5 py-0.5 text-app leading-5',
    canOpenEntityPanel &&
      'cursor-pointer transition-colors hover:border-[color-mix(in_oklab,var(--linear-border-focus)_58%,transparent)] hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color-mix(in_oklab,var(--linear-border-focus)_72%,transparent)]'
  );
  const focusKey = useMemo(
    () => `${data.kind}:${data.id}:${data.label}`,
    [data.id, data.kind, data.label]
  );
  const contents = (
    <>
      {data.thumbnail ? (
        <Image
          src={data.thumbnail}
          alt=''
          width={14}
          height={14}
          className='h-3.5 w-3.5 rounded-sm object-cover'
          aria-hidden
        />
      ) : (
        <span
          aria-hidden
          className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--jovie-entity-accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--jovie-entity-accent)_12%,transparent)]'
        />
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
    </>
  );

  if (canOpenEntityPanel && !onRemove) {
    return (
      <button
        type='button'
        className={commonClassName}
        style={accentStyle}
        aria-label={`Open ${prefix}: ${data.label}`}
        title={`${prefix}: ${data.label}`}
        onClick={() =>
          entityPanel.open({
            kind: 'release',
            id: data.id,
            label: data.label,
            source: 'manual',
            focusKey,
          })
        }
      >
        {contents}
      </button>
    );
  }

  if (onRemove) {
    return (
      <span
        {...inputChipAttributes}
        className={commonClassName}
        style={accentStyle}
        title={`${prefix}: ${data.label}`}
      >
        {contents}
      </span>
    );
  }

  return (
    <span
      {...inputChipAttributes}
      className={commonClassName}
      style={accentStyle}
      role='img'
      aria-label={`${prefix}: ${data.label}`}
      title={`${prefix}: ${data.label}`}
    >
      {contents}
    </span>
  );
}
