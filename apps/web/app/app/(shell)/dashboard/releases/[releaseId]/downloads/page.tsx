'use client';

/**
 * Dashboard: Promo Downloads Management
 *
 * Artist uploads audio files for email-gated downloads.
 * Pro-only feature. Lists existing downloads with active toggle and delete.
 */

import { buttonVariants } from '@jovie/ui';
import { upload } from '@vercel/blob/client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

interface PromoDownloadFile {
  id: string;
  title: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number | null;
  isActive: boolean;
  position: number;
}

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB

const ALLOWED_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/flac',
  'audio/aiff',
  'audio/mp4',
  'audio/x-m4a',
]);

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': 'MP3',
    'audio/wav': 'WAV',
    'audio/flac': 'FLAC',
    'audio/aiff': 'AIFF',
    'audio/mp4': 'M4A',
    'audio/x-m4a': 'M4A',
  };
  return map[mimeType] ?? 'Audio';
}

export default function PromoDownloadsPage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const [files, setFiles] = useState<PromoDownloadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing files on mount
  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/promo-downloads/confirm?releaseId=${releaseId}&list=true`
      );
      if (!res.ok) {
        setListError('Unable to load promo downloads right now.');
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.files)) {
        setFiles(data.files);
      }
      setListError(null);
    } catch {
      setListError('Unable to load promo downloads right now.');
    } finally {
      setLoaded(true);
    }
  }, [releaseId]);

  // Load on first render
  useEffect(() => {
    if (!loaded) {
      loadFiles();
    }
  }, [loaded, loadFiles]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        setUploadError(
          'Invalid file type. Supported: MP3, WAV, FLAC, AIFF, M4A.'
        );
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setUploadError('File too large. Maximum size is 150 MB.');
        return;
      }

      setUploading(true);
      setUploadError(null);
      setOperationError(null);

      try {
        // Client-side upload to Vercel Blob
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/promo-downloads/upload-token',
        });

        // Confirm upload and create DB record
        const title = file.name.replace(/\.[^.]+$/, ''); // Strip extension
        const res = await fetch('/api/promo-downloads/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            releaseId,
            title,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            fileName: file.name,
            fileMimeType: file.type,
            fileSizeBytes: file.size,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setUploadError(data.error ?? 'Upload failed. Please try again.');
          return;
        }

        const data = await res.json();
        setFiles(prev => [...prev, data.promoDownload]);
      } catch (err) {
        setUploadError(
          err instanceof Error
            ? err.message
            : 'Upload failed. Please try again.'
        );
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [releaseId]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadFile(file);
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file || uploading) return;
      await uploadFile(file);
    },
    [uploadFile, uploading]
  );

  const handleToggleActive = useCallback(
    async (fileId: string, isActive: boolean) => {
      try {
        setOperationError(null);
        const res = await fetch(`/api/promo-downloads/${fileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive }),
        });
        if (!res.ok) {
          throw new Error('Unable to update file visibility.');
        }
        setFiles(prev =>
          prev.map(f => (f.id === fileId ? { ...f, isActive } : f))
        );
      } catch {
        setOperationError(
          'Unable to update file visibility. Please try again.'
        );
      }
    },
    []
  );

  const handleDelete = useCallback(async (fileId: string) => {
    try {
      setOperationError(null);
      const res = await fetch(`/api/promo-downloads/${fileId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Unable to delete file.');
      }
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch {
      setOperationError('Unable to delete this file. Please try again.');
    }
  }, []);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4'>
      <ContentSurfaceCard as='section' className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Promo downloads'
          subtitle='Upload audio files for email-gated fan downloads.'
          subtitleClassName='whitespace-normal'
        />
        <div className='p-3 sm:p-4'>
          <button
            type='button'
            aria-disabled={uploading || undefined}
            aria-label='Drop or choose a promo download audio file'
            onClick={() => {
              if (!uploading) {
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={e => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            className={cn(
              'flex min-h-[154px] flex-col items-center justify-center rounded-lg border border-dashed border-(--linear-app-frame-seam) bg-surface-0 px-4 py-6 text-center transition-[background-color,border-color]',
              isDragging &&
                'border-(--linear-border-focus) bg-[color-mix(in_oklab,var(--linear-border-focus)_8%,var(--linear-bg-surface-0))]'
            )}
            data-testid='promo-download-dropzone'
          >
            <Icon
              name='Upload'
              className='h-8 w-8 text-tertiary-token'
              aria-hidden='true'
            />
            <p className='mt-3 text-sm font-medium text-primary-token'>
              {uploading ? 'Uploading audio...' : 'Drop an audio file here'}
            </p>
            <p className='mt-1 text-2xs text-tertiary-token'>
              MP3, WAV, FLAC, AIFF, M4A. Max 150 MB.
            </p>
            <span
              className={buttonVariants({
                variant: 'secondary',
                size: 'sm',
                className: 'mt-3',
              })}
            >
              Choose file
            </span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type='file'
          accept='audio/mpeg,audio/wav,audio/flac,audio/aiff,audio/mp4,audio/x-m4a'
          onChange={handleFileSelect}
          disabled={uploading}
          className='sr-only'
          aria-label='Upload promo download audio file'
        />
        {uploadError && (
          <p
            className='border-t border-subtle px-3 py-2.5 text-xs text-error sm:px-4'
            role='status'
          >
            {uploadError}
          </p>
        )}
      </ContentSurfaceCard>

      {(listError || operationError) && (
        <ContentSurfaceCard className='border-error/20 bg-error-subtle px-3 py-2.5 text-xs text-error'>
          {operationError ?? listError}
        </ContentSurfaceCard>
      )}

      {/* File list */}
      {files.length > 0 ? (
        <div className='space-y-2'>
          {files.map(file => (
            <ContentSurfaceCard
              key={file.id}
              surface='nested'
              className='flex items-center gap-3 px-3 py-2.5'
            >
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium text-primary-token'>
                  {file.title}
                </p>
                <p className='text-2xs text-tertiary-token'>
                  {formatExtension(file.fileMimeType)}
                  {file.fileSizeBytes
                    ? ` · ${formatFileSize(file.fileSizeBytes)}`
                    : ''}
                </p>
              </div>

              {/* Active toggle */}
              <button
                type='button'
                onClick={() => handleToggleActive(file.id, !file.isActive)}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
                  file.isActive
                    ? 'border-success/20 bg-success-subtle text-success hover:bg-success/10'
                    : 'border-(--linear-app-frame-seam) bg-surface-0 text-tertiary-token hover:bg-surface-1 hover:text-secondary-token'
                )}
              >
                {file.isActive ? 'Active' : 'Hidden'}
              </button>

              {/* Delete */}
              <button
                type='button'
                onClick={() => handleDelete(file.id)}
                className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
                aria-label={`Delete ${file.title}`}
              >
                <Icon name='Trash2' className='h-4 w-4' aria-hidden='true' />
              </button>
            </ContentSurfaceCard>
          ))}
        </div>
      ) : (
        loaded && (
          <ContentSurfaceCard className='flex flex-col items-center justify-center px-6 py-8 text-center'>
            <Icon
              name='Music'
              className='h-8 w-8 text-tertiary-token'
              aria-hidden='true'
            />
            <p className='mt-3 text-sm font-medium text-primary-token'>
              No download files yet.
            </p>
            <p className='mt-1 max-w-sm text-xs text-tertiary-token'>
              Upload audio files to create an email-gated download page for this
              release.
            </p>
          </ContentSurfaceCard>
        )
      )}
    </div>
  );
}
