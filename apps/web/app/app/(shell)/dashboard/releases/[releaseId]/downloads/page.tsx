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
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AUDIO_FILE_ACCEPT,
  AUDIO_UPLOAD_POLICIES,
  canonicalizeAudioFileForUpload,
  isSupportedAudioFile,
  SUPPORTED_AUDIO_FORMAT_LABELS,
} from '@/lib/audio/constants';
import { getPromoDownloadAudioUploadPath } from '@/lib/audio/upload-paths';
import { cn } from '@/lib/utils';
import {
  type PromoDownloadFile,
  PromoDownloadsTable,
} from './PromoDownloadsTable';

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
      if (!isSupportedAudioFile(file)) {
        setUploadError(
          `Invalid file type. Supported: ${SUPPORTED_AUDIO_FORMAT_LABELS.join(', ')}.`
        );
        return;
      }

      if (file.size > AUDIO_UPLOAD_POLICIES.promo_download.maxFileSizeBytes) {
        setUploadError('File too large. Maximum size is 150 MB.');
        return;
      }

      setUploading(true);
      setUploadError(null);
      setOperationError(null);

      try {
        const uploadFile = canonicalizeAudioFileForUpload(file);
        // Client-side upload to Vercel Blob
        const blob = await upload(
          getPromoDownloadAudioUploadPath(releaseId, uploadFile.name),
          uploadFile,
          {
            access: 'public',
            handleUploadUrl: '/api/promo-downloads/upload-token',
            clientPayload: JSON.stringify({ releaseId }),
          }
        );

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
            fileName: uploadFile.name,
            fileMimeType: uploadFile.type,
            fileSizeBytes: uploadFile.size,
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
    <PageShell
      aria-label='Promo Downloads'
      data-testid='release-downloads-shell'
    >
      <PageContent>
        <div className='flex h-full min-h-0 flex-col gap-4'>
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
                aria-label='Drop Or Choose A Promo Download Audio File'
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
                  'flex min-h-39 flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0 px-4 py-6 text-center transition-[background-color,border-color,box-shadow]',
                  isDragging && 'border-focus bg-surface-1 ring-2 ring-focus/20'
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
                  {SUPPORTED_AUDIO_FORMAT_LABELS.join(', ')}. Max 150 MB.
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
              accept={AUDIO_FILE_ACCEPT}
              onChange={handleFileSelect}
              disabled={uploading}
              className='sr-only'
              aria-label='Upload Promo Download Audio File'
            />
            <output
              className='block min-h-9 border-t border-transparent px-3 py-2.5 text-xs sm:px-4'
              aria-live='polite'
            >
              {uploadError ? <p className='text-error'>{uploadError}</p> : null}
            </output>
          </ContentSurfaceCard>

          <output className='block min-h-10' aria-live='polite'>
            {listError || operationError ? (
              <ContentSurfaceCard className='border-error/20 bg-error-subtle px-3 py-2.5 text-xs text-error'>
                {operationError ?? listError}
              </ContentSurfaceCard>
            ) : null}
          </output>

          <PromoDownloadsTable
            files={files}
            loaded={loaded}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        </div>
      </PageContent>
    </PageShell>
  );
}
