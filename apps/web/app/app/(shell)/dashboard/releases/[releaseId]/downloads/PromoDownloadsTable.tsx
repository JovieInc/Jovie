'use client';

// @coverage-via apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/PromoDownloadsTable.test.tsx

import { IconButton, Switch } from '@jovie/ui';
import { Music, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import type { ColumnDef } from '@/lib/tanstack-v8-compat';
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

const FILE_TYPE_LABELS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/flac': 'FLAC',
  'audio/aiff': 'AIFF',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExtension(mimeType: string): string {
  return FILE_TYPE_LABELS[mimeType] ?? 'Audio';
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
            <div className='inline-flex items-center gap-2'>
              <Switch
                checked={file.isActive}
                onCheckedChange={checked => onToggleActive(file.id, checked)}
                aria-label={`Toggle ${file.title} visibility`}
              />
              <span
                className={cn(
                  'text-2xs font-medium',
                  file.isActive ? 'text-emerald-500' : 'text-tertiary-token'
                )}
              >
                {file.isActive ? 'Active' : 'Hidden'}
              </span>
            </div>
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
            <IconButton
              onClick={() => onDelete(file.id)}
              variant='inline'
              size='xs'
              ariaLabel={`Delete ${file.title}`}
              className='hover:text-error'
            >
              <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
            </IconButton>
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
        heading='No Downloads Yet'
        description='Upload audio files to create an email-gated download page for this release.'
        className='max-w-none'
      />
    );
  }

  return (
    <ContentSurfaceCard
      surface='table'
      className='overflow-hidden p-0'
      data-testid='promo-downloads-table-surface'
    >
      <UnifiedTable
        data={files}
        columns={columns}
        getRowId={file => file.id}
        enableVirtualization={false}
        minWidth='100%'
        className='text-xs [&_thead_th]:py-1 [&_thead_th]:text-3xs [&_thead_th]:tracking-normal'
      />
    </ContentSurfaceCard>
  );
}
