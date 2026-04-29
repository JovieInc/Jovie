'use client';

import Image from 'next/image';
import { useMemo } from 'react';
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
}

const KIND_PREFIX: Record<EntityKind, string> = {
  release: 'Release',
  artist: 'Artist',
  track: 'Track',
  event: 'Event',
};

export function EntityChip({
  data,
  variant = 'input',
  isInputChip = false,
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
  const commonClassName = cn(
    'inline-flex items-center gap-1.5 rounded-md border border-subtle bg-surface-0 px-1.5 py-0.5 align-baseline text-app leading-5 text-primary-token',
    'select-none',
    variant === 'input' &&
      'mx-0.5 cursor-default shadow-[0_1px_1px_rgba(0,0,0,0.04)]',
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
          className='inline-block h-1.5 w-1.5 rounded-full bg-tertiary-token'
        />
      )}
      <span className='max-w-[180px] truncate'>{data.label}</span>
    </>
  );

  if (canOpenEntityPanel) {
    return (
      <button
        type='button'
        className={commonClassName}
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

  return (
    <span
      {...inputChipAttributes}
      className={commonClassName}
      role='img'
      aria-label={`${prefix}: ${data.label}`}
      title={`${prefix}: ${data.label}`}
    >
      {contents}
    </span>
  );
}
