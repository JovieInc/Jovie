'use client';

import { upload } from '@vercel/blob/client';
import { FileAudio2, Loader2, Upload } from 'lucide-react';
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from '@/components/feedback';
import {
  AUDIO_ACCEPT,
  AUDIO_MAX_FILE_SIZE_BYTES,
  isSupportedAudioFile,
} from '@/lib/audio/constants';
import type { AudioSnippet } from '@/lib/audio/snippet';
import { cn } from '@/lib/utils';
import { AudioWaveformEditor } from './AudioWaveformEditor';

export interface ReleaseAudioAssetPanelProps {
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly previewUrl?: string | null;
  readonly durationMs?: number | null;
  readonly initialSnippet?: AudioSnippet | null;
  readonly isEditable?: boolean;
  readonly onUploaded?: (previewUrl: string) => void;
  readonly onSnippetSaved?: (snippet: AudioSnippet) => void;
  readonly disabledTabIndex?: number;
  readonly testIdPrefix?: 'release' | 'library';
}

export function ReleaseAudioAssetPanel({
  releaseId,
  releaseTitle,
  previewUrl,
  durationMs,
  initialSnippet,
  isEditable = true,
  onUploaded,
  onSnippetSaved,
  disabledTabIndex,
  testIdPrefix = 'release',
}: ReleaseAudioAssetPanelProps) {
  const dropzoneTestId =
    testIdPrefix === 'library'
      ? 'library-audio-dropzone'
      : 'release-audio-dropzone';
  const readyTestId =
    testIdPrefix === 'library' ? 'library-audio-ready' : 'release-audio-ready';
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState(previewUrl ?? null);
  const [snippet, setSnippet] = useState<AudioSnippet | null>(
    initialSnippet ?? null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setLocalPreviewUrl(previewUrl ?? null);
  }, [previewUrl]);

  useEffect(() => {
    setSnippet(initialSnippet ?? null);
  }, [initialSnippet]);

  useEffect(() => {
    if (initialSnippet || !localPreviewUrl) return;

    let cancelled = false;
    fetch(
      `/api/library/audio/snippet?releaseId=${encodeURIComponent(releaseId)}`
    )
      .then(async response => {
        if (!response.ok) return null;
        return (await response.json()) as {
          snippet?: AudioSnippet | null;
        };
      })
      .then(body => {
        if (cancelled || !body?.snippet) return;
        setSnippet(body.snippet);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initialSnippet, localPreviewUrl, releaseId]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isEditable) return;

      if (!isSupportedAudioFile(file)) {
        setUploadError('Use MP3, WAV, FLAC, AIFF, AAC, or M4A audio.');
        return;
      }

      if (file.size > AUDIO_MAX_FILE_SIZE_BYTES) {
        setUploadError('Audio must be 150 MB or smaller.');
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/library/audio/upload-token',
        });

        const response = await fetch('/api/library/audio/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            releaseId,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            fileName: file.name,
            fileMimeType: file.type,
            fileSizeBytes: file.size,
          }),
        });

        const body = (await response.json().catch(() => ({}))) as {
          readonly previewUrl?: string;
          readonly error?: string;
        };

        if (!response.ok || !body.previewUrl) {
          throw new Error(body.error ?? 'Audio upload failed');
        }

        setLocalPreviewUrl(body.previewUrl);
        setSnippet(null);
        onUploaded?.(body.previewUrl);
        toast.success('Audio attached to release');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Audio upload failed';
        setUploadError(message);
        toast.error(message);
      } finally {
        setIsUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [isEditable, onUploaded, releaseId]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) uploadFile(file).catch(() => {});
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) uploadFile(file).catch(() => {});
    },
    [uploadFile]
  );

  const handleSaveSnippet = useCallback(
    async (nextSnippet: AudioSnippet) => {
      const response = await fetch('/api/library/audio/snippet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId,
          startMs: nextSnippet.startMs,
          endMs: nextSnippet.endMs,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        readonly snippet?: AudioSnippet;
        readonly error?: string;
      };

      if (!response.ok || !body.snippet) {
        throw new Error(body.error ?? 'Failed to save snippet');
      }

      setSnippet(body.snippet);
      onSnippetSaved?.(body.snippet);
      toast.success('Snippet saved for promo drops');
    },
    [onSnippetSaved, releaseId]
  );

  if (!localPreviewUrl) {
    return (
      <div data-testid={dropzoneTestId}>
        <button
          type='button'
          onClick={() => inputRef.current?.click()}
          onDragEnter={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={event => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          disabled={!isEditable || isUploading}
          tabIndex={disabledTabIndex}
          className={cn(
            'flex min-h-30 w-full flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0 px-3 py-4 text-center transition-[background-color,border-color,color] duration-subtle ease-subtle',
            isDragging &&
              'border-(--linear-border-focus) bg-[color-mix(in_oklab,var(--linear-border-focus)_8%,var(--linear-bg-surface-0))]',
            isEditable &&
              !isUploading &&
              'hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface)'
          )}
          aria-busy={isUploading || undefined}
        >
          {isUploading ? (
            <Loader2
              className='h-5 w-5 animate-spin text-secondary-token motion-reduce:animate-none'
              aria-hidden='true'
              strokeWidth={2.25}
            />
          ) : (
            <Upload
              className='h-5 w-5 text-tertiary-token'
              aria-hidden='true'
              strokeWidth={2.25}
            />
          )}
          <span className='mt-2 text-xs font-medium text-primary-token'>
            {isUploading ? 'Uploading audio' : 'Drop audio'}
          </span>
          <span className='mt-1 text-2xs leading-4 text-tertiary-token'>
            MP3, WAV, FLAC, AIFF, AAC, or M4A. Max 150 MB.
          </span>
        </button>
        <input
          ref={inputRef}
          type='file'
          accept={AUDIO_ACCEPT}
          onChange={handleInputChange}
          disabled={!isEditable || isUploading}
          tabIndex={disabledTabIndex}
          className='sr-only'
          aria-label={`Upload audio for ${releaseTitle}`}
        />
        <output className='min-h-5 pt-1.5 text-2xs'>
          {uploadError ? <p className='text-error'>{uploadError}</p> : null}
        </output>
      </div>
    );
  }

  return (
    <div className='space-y-3' data-testid={readyTestId}>
      <div className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-0 px-3 py-3'>
        <span className='grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-1 text-secondary-token'>
          <FileAudio2 className='h-4 w-4' strokeWidth={2.25} />
        </span>
        <div className='min-w-0'>
          <p className='truncate text-xs font-medium text-primary-token'>
            Audio attached
          </p>
          <p className='mt-0.5 text-2xs leading-4 text-tertiary-token'>
            Preview, scrub, and trim a promo snippet for drops.
          </p>
        </div>
      </div>

      <AudioWaveformEditor
        audioUrl={localPreviewUrl}
        durationMs={durationMs}
        initialSnippet={snippet}
        onSaveSnippet={isEditable ? handleSaveSnippet : undefined}
        disabled={!isEditable}
      />
    </div>
  );
}
