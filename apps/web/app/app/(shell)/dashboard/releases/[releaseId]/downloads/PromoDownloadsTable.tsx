'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Music, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import { getAudioFormatLabel } from '@/lib/audio/constants';
import { cn } from '@/lib/utils';

export interface PromoDownloadFile {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly fileSizeBytes: number | null;
  readonly isActive: boolean;
  readonly position: number;
}

export interface PromoDownloadsTableProps {
  readonly files: PromoDownloadFile[];
  readonly loaded: boolean;
  readonly onToggleActive: (fileId: string, isActive: boolean) => void;
  readonly onDelete: (fileId: string) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExtension(mimeType: string): string {
  return getAudioFormatLabel(mimeType);
}

function getFileMeta(file: PromoDownloadFile): string {
  const fileType = formatExtension(file.fileMimeType);
  const fileSize = formatFileSize(file.fileSizeBytes);
  return fileSize ? `${fileType} · ${fileSize}` : fileType;
}

export function PromoDownloadsTable({
  files,
  loaded,
  onToggleActive,
  onDelete,
}: Readonly<PromoDownloadsTableProps>) {
  const columns = useMemo<ColumnDef<PromoDownloadFile, unknown>[]>(
    () => [
      {
        id: 'file',
        accessorFn: row => row.title,
        header: 'File',
        cell: ({ row }) => {
          const file = row.original;
          const fileMeta = getFileMeta(file);

          return (
            <div className='flex min-w-0 items-center gap-2'>
              <span className='truncate font-medium text-primary-token'>
                {file.title}
              </span>
              <span className='shrink-0 text-tertiary-token'>·</span>
              <span className='shrink-0 text-2xs text-tertiary-token'>
                {fileMeta}
              </span>
            </div>
          );
        },
        size: 320,
        minSize: 220,
        meta: {
          className: 'pl-4 pr-2',
        },
      },
      {
        id: 'status',
        accessorFn: row => row.isActive,
        header: 'Status',
        cell: ({ row }) => {
          const file = row.original;

          return (
            <button
              type='button'
              onClick={() => onToggleActive(file.id, !file.isActive)}
              aria-pressed={file.isActive}
              className={cn(
                'inline-flex h-6 items-center rounded-full border px-2 text-2xs font-medium transition-colors',
                file.isActive
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
                  : 'border-subtle bg-surface-0 text-tertiary-token'
              )}
            >
              {file.isActive ? 'Active' : 'Hidden'}
            </button>
          );
        },
        size: 96,
        minSize: 88,
        meta: {
          className: 'px-2',
        },
      },
      {
        id: 'actions',
        accessorFn: row => row.id,
        header: 'Actions',
        cell: ({ row }) => {
          const file = row.original;

          return (
            <button
              type='button'
              onClick={() => onDelete(file.id)}
              className='inline-flex h-6 w-6 items-center justify-center rounded-full text-tertiary-token transition-colors hover:text-red-400'
              aria-label={`Delete ${file.title}`}
            >
              <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
          );
        },
        size: 72,
        minSize: 72,
        meta: {
          className: 'pr-4 text-right',
        },
      },
    ],
    [onDelete, onToggleActive]
  );

  if (!loaded && files.length === 0) {
    return (
      <div
        aria-hidden='true'
        className='min-h-55 rounded-lg border border-subtle bg-surface-1 skeleton'
      />
    );
  }

  if (loaded && files.length === 0) {
    return (
      <TableEmptyState
        icon={<Music className='h-6 w-6' aria-hidden='true' />}
        title='No Downloads Yet'
        description='Upload audio files to create an email-gated download page for this release.'
        className='max-w-none'
      />
    );
  }

  return (
    <div className='overflow-hidden rounded-xl border border-subtle bg-surface-1'>
      <UnifiedTable
        data={files}
        columns={columns}
        getRowId={file => file.id}
        enableVirtualization={false}
        minWidth='100%'
        className='text-xs [&_thead_th]:py-1 [&_thead_th]:text-3xs [&_thead_th]:tracking-normal'
      />
    </div>
  );
}
