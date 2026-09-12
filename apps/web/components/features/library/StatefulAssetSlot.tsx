'use client';

import { Button } from '@jovie/ui';
import { FileAudio2, FileText, ImageIcon, Upload, Video } from 'lucide-react';
import Link from 'next/link';
import { type DragEvent, type ReactNode, useRef, useState } from 'react';
import {
  assertPopulatedSlotHidesDropZone,
  type LibraryInspectorAssetKind,
  type ResolveStatefulAssetSlotInput,
  resolveStatefulAssetSlot,
} from '@/lib/library/stateful-asset-slot';
import { cn } from '@/lib/utils';

const ICONS = {
  audio: FileAudio2,
  artwork: ImageIcon,
  video: Video,
  docs: FileText,
  stems: FileAudio2,
} as const;

const PANEL =
  'rounded-lg border border-subtle bg-surface-0 px-3 py-3 text-left';

export interface StatefulAssetSlotProps extends ResolveStatefulAssetSlotInput {
  readonly kind: LibraryInspectorAssetKind;
  readonly testIdPrefix: string;
  readonly objectTitle: string;
  readonly objectSubtitle?: string;
  readonly previewSrc?: string | null;
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly acquireLabel: string;
  readonly acquireHint?: string;
  readonly acquireHref?: string;
  readonly onFile?: (file: File) => void;
  readonly addHref?: string;
  readonly children?: ReactNode;
}

export function StatefulAssetSlot({
  kind,
  occupancy,
  cardinality,
  acquireMode,
  testIdPrefix,
  objectTitle,
  objectSubtitle,
  previewSrc,
  accept,
  disabled = false,
  acquireLabel,
  acquireHint,
  acquireHref,
  onFile,
  addHref,
  children,
}: StatefulAssetSlotProps) {
  const presentation = resolveStatefulAssetSlot({
    occupancy,
    cardinality,
    acquireMode,
  });
  assertPopulatedSlotHidesDropZone(presentation);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const Icon = ICONS[kind];
  const pick = () => inputRef.current?.click();
  const takeFile = (file?: File) => {
    if (file) onFile?.(file);
    if (inputRef.current) inputRef.current.value = '';
  };
  const drag = (on: boolean) => (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(on);
  };
  const fileInput =
    onFile && accept ? (
      <input
        ref={inputRef}
        type='file'
        accept={accept}
        disabled={disabled}
        className='sr-only'
        aria-label={occupancy === 'populated' ? 'Replace' : acquireLabel}
        onChange={event => takeFile(event.target.files?.[0])}
      />
    ) : null;

  if (presentation.showAcquisitionDropZone) {
    return (
      <div
        data-testid={`${testIdPrefix}-dropzone`}
        data-asset-slot-mode='acquisition'
      >
        <button
          type='button'
          onClick={pick}
          onDragEnter={drag(true)}
          onDragOver={drag(true)}
          onDragLeave={drag(false)}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            takeFile(event.dataTransfer.files?.[0]);
          }}
          disabled={disabled || !onFile}
          className={cn(
            PANEL,
            'flex min-h-30 w-full flex-col items-center justify-center border-dashed py-4 text-center',
            dragging && 'border-default bg-surface-1',
            !disabled && onFile && 'hover:border-default hover:bg-surface-1 focus-ring-themed'
          )}
        >
          <Upload className='h-5 w-5 text-tertiary-token' aria-hidden />
          <span className='mt-2 text-xs font-medium text-primary-token'>
            {acquireLabel}
          </span>
          {acquireHint ? (
            <span className='mt-1 text-2xs text-tertiary-token'>{acquireHint}</span>
          ) : null}
        </button>
        {fileInput}
      </div>
    );
  }

  if (presentation.mode === 'acquisition') {
    return (
      <div
        className={cn(PANEL, 'border-dashed py-4')}
        data-testid={`${testIdPrefix}-acquisition`}
        data-asset-slot-mode='acquisition'
      >
        <p className='text-xs font-medium text-primary-token'>{acquireLabel}</p>
        {acquireHint ? (
          <p className='mt-1 text-2xs text-tertiary-token'>{acquireHint}</p>
        ) : null}
        {acquireHref ? (
          <Button asChild size='sm' variant='secondary' className='mt-3'>
            <Link href={acquireHref} tabIndex={disabled ? -1 : undefined}>
              {acquireLabel}
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className='space-y-3' data-testid={`${testIdPrefix}-object`}>
      <div className={cn(PANEL, 'flex items-center gap-3')}>
        <span className='grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-1 text-secondary-token'>
          {kind === 'artwork' && previewSrc ? (
            <img src={previewSrc} alt='' className='h-8 w-8 object-contain' />
          ) : (
            <Icon className='h-4 w-4' strokeWidth={2.25} />
          )}
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-xs font-medium text-primary-token'>
            {objectTitle}
          </p>
          {objectSubtitle ? (
            <p className='mt-0.5 text-2xs text-tertiary-token'>{objectSubtitle}</p>
          ) : null}
        </div>
        {presentation.replaceAction === 'secondary' && onFile ? (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={disabled}
            onClick={pick}
            data-testid={`${testIdPrefix}-replace`}
          >
            Replace
          </Button>
        ) : null}
        {presentation.addAction === 'secondary' && addHref ? (
          <Button asChild size='sm' variant='ghost'>
            <Link href={addHref} tabIndex={disabled ? -1 : undefined} data-testid={`${testIdPrefix}-add`}>
              Add
            </Link>
          </Button>
        ) : null}
      </div>
      {fileInput}
      {children}
    </div>
  );
}
