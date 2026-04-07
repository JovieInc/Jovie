'use client';

/**
 * Dashboard: Promo Downloads Management
 *
 * Artist uploads audio files for email-gated downloads.
 * Pro-only feature. Lists existing downloads with active toggle and delete.
 */

import { upload } from '@vercel/blob/client';
import { useParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing files on mount
  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/promo-downloads/confirm?releaseId=${releaseId}&list=true`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.files)) {
          setFiles(data.files);
        }
      }
    } catch {
      // Silently fail — files just won't load
    } finally {
      setLoaded(true);
    }
  }, [releaseId]);

  // Load on first render
  if (!loaded) {
    void loadFiles();
  }

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

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
          setUploadError(data.error ?? 'Upload failed');
          return;
        }

        const data = await res.json();
        setFiles(prev => [...prev, data.promoDownload]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [releaseId]
  );

  const handleToggleActive = useCallback(
    async (fileId: string, isActive: boolean) => {
      try {
        await fetch(`/api/promo-downloads/${fileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive }),
        });
        setFiles(prev =>
          prev.map(f => (f.id === fileId ? { ...f, isActive } : f))
        );
      } catch {
        // Revert on error
      }
    },
    []
  );

  const handleDelete = useCallback(async (fileId: string) => {
    try {
      await fetch(`/api/promo-downloads/${fileId}`, {
        method: 'DELETE',
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-foreground text-sm font-semibold'>
          Promo Downloads
        </h2>
        <p className='text-muted-foreground mt-1 text-xs'>
          Upload audio files for email-gated downloads. Fans enter their email
          to get the files.
        </p>
      </div>

      {/* Upload area */}
      <div className='rounded-xl border border-dashed border-white/10 p-6 text-center'>
        <Icon
          name='Upload'
          className='text-muted-foreground mx-auto h-8 w-8'
          aria-hidden='true'
        />
        <p className='text-muted-foreground mt-2 text-sm'>
          {uploading ? 'Uploading...' : 'Drop an audio file or click to upload'}
        </p>
        <p className='text-muted-foreground/60 mt-1 text-2xs'>
          MP3, WAV, FLAC, AIFF, M4A — max 150 MB
        </p>
        <input
          ref={fileInputRef}
          type='file'
          accept='audio/mpeg,audio/wav,audio/flac,audio/aiff,audio/mp4,audio/x-m4a'
          onChange={handleFileSelect}
          disabled={uploading}
          className='absolute inset-0 cursor-pointer opacity-0'
          style={{ position: 'relative' }}
        />
        {uploadError && (
          <p className='mt-2 text-xs text-red-400'>{uploadError}</p>
        )}
      </div>

      {/* File list */}
      {files.length > 0 ? (
        <div className='space-y-2'>
          {files.map(file => (
            <div
              key={file.id}
              className='flex items-center gap-3 rounded-lg bg-surface-1 px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]'
            >
              <div className='min-w-0 flex-1'>
                <p className='text-foreground truncate text-sm font-medium'>
                  {file.title}
                </p>
                <p className='text-muted-foreground text-2xs'>
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
                className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors ${
                  file.isActive
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-white/5 text-white/40'
                }`}
              >
                {file.isActive ? 'Active' : 'Hidden'}
              </button>

              {/* Delete */}
              <button
                type='button'
                onClick={() => handleDelete(file.id)}
                className='text-muted-foreground hover:text-red-400 shrink-0 transition-colors'
                aria-label={`Delete ${file.title}`}
              >
                <Icon name='Trash2' className='h-4 w-4' aria-hidden='true' />
              </button>
            </div>
          ))}
        </div>
      ) : (
        loaded && (
          <div className='rounded-xl bg-surface-1 p-8 text-center'>
            <Icon
              name='Music'
              className='text-muted-foreground mx-auto h-10 w-10'
              aria-hidden='true'
            />
            <p className='text-muted-foreground mt-3 text-sm'>
              No download files yet
            </p>
            <p className='text-muted-foreground/60 mt-1 text-xs'>
              Upload audio files to create an email-gated download page for this
              release.
            </p>
          </div>
        )
      )}
    </div>
  );
}
