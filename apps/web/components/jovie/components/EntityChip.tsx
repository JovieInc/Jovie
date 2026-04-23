'use client';

import Image from 'next/image';
import type { EntityKind } from '@/lib/chat/tokens';
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
};

export function EntityChip({
  data,
  variant = 'input',
  isInputChip = false,
}: EntityChipProps) {
  const prefix = KIND_PREFIX[data.kind];
  return (
    <span
      {...(isInputChip
        ? {
            contentEditable: false,
            'data-entity-chip': 'true',
            'data-entity-kind': data.kind,
            'data-entity-id': data.id,
            'data-entity-label': data.label,
          }
        : {})}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-(--linear-app-frame-seam) bg-surface-0 px-1.5 py-0.5 align-baseline text-[13px] leading-5 text-primary-token',
        'select-none',
        variant === 'input' &&
          'mx-0.5 cursor-default shadow-[0_1px_1px_rgba(0,0,0,0.04)]'
      )}
      role='img'
      aria-label={`${prefix}: ${data.label}`}
      title={`${prefix}: ${data.label}`}
    >
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
    </span>
  );
}
