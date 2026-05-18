'use client';

import { Music, Trash2 } from 'lucide-react';
import {
  TableCell,
  TableEmptyState,
  TableHeaderCell,
  TableHeaderRow,
} from '@/components/organisms/table';
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
  if (!loaded && files.length === 0) {
    return null;
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
      <table className='min-w-full border-separate border-spacing-0'>
        <thead>
          <TableHeaderRow>
            <TableHeaderCell sticky={false} className='w-[68%] pl-4'>
              File
            </TableHeaderCell>
            <TableHeaderCell sticky={false} className='w-[16%]'>
              Status
            </TableHeaderCell>
            <TableHeaderCell
              sticky={false}
              align='right'
              className='w-[16%] pr-4'
            >
              Actions
            </TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {files.map(file => {
            const fileMeta = getFileMeta(file);

            return (
              <tr key={file.id} className='group'>
                <TableCell className='pl-4 pr-2'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span className='truncate font-medium text-primary-token'>
                      {file.title}
                    </span>
                    <span className='shrink-0 text-tertiary-token'>·</span>
                    <span className='shrink-0 text-2xs text-tertiary-token'>
                      {fileMeta}
                    </span>
                  </div>
                </TableCell>

                <TableCell className='px-2'>
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
                </TableCell>

                <TableCell className='pr-4 text-right'>
                  <button
                    type='button'
                    onClick={() => onDelete(file.id)}
                    className='inline-flex h-6 w-6 items-center justify-center rounded-full text-tertiary-token transition-colors hover:text-red-400'
                    aria-label={`Delete ${file.title}`}
                  >
                    <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
                  </button>
                </TableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
