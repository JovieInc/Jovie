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
  type AudioUploadRejection,
  SUPPORTED_AUDIO_FORMAT_LABELS,
  validateAudioUpload,
} from '@/lib/audio/constants';
import type { AudioSnippet } from '@/lib/audio/snippet';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/utils/logger';
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
  const [uploadRejection, setUploadRejection] =
    useState<AudioUploadRejection | null>(null);
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

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleRequestType = useCallback((rejection: AudioUploadRejection) => {
    logger.info('[audio-upload] request unsupported type', {
      code: rejection.code,
      rule: rejection.rule,
      message: rejection.message,
    });
    toast.success('Request noted — we track demand for new formats');
  }, []);

  const handleRejectionCta = useCallback(
    (rejection: AudioUploadRejection) => {
      if (rejection.cta.action === 'request_type') {
        handleRequestType(rejection);
        return;
      }
      openFilePicker();
    },
    [handleRequestType, openFilePicker]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isEditable) return;

      const validation = validateAudioUpload(file);
      if (!validation.ok) {
        setUploadRejection(validation);
        setUploadError(null);
        return;
      }

      setIsUploading(true);
      setUploadError(null);
      setUploadRejection(null);

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
        setUploadRejection(null);
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
    const formats = SUPPORTED_AUDIO_FORMAT_LABELS.join(', ');
    return (
      <div data-testid={dropzoneTestId}>
        <button
          type='button'
          onClick={openFilePicker}
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
            {formats}. Max 150 MB.
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
        <output
          className='min-h-12 space-y-1.5 pt-1.5 text-2xs'
          data-testid='release-audio-upload-feedback'
        >
          {uploadRejection ? (
            <div className='rounded-md border border-subtle bg-surface-0 px-2.5 py-2 text-left'>
              <p className='font-medium text-error' data-testid='upload-rule'>
                {uploadRejection.rule}
              </p>
              <p className='mt-0.5 text-secondary-token'>
                {uploadRejection.message}
              </p>
              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={() => handleRejectionCta(uploadRejection)}
                  className='rounded-md border border-subtle bg-surface-1 px-2 py-1 text-2xs font-medium text-primary-token transition-colors duration-subtle hover:bg-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
                  data-testid='upload-rejection-cta'
                >
                  {uploadRejection.cta.label}
                </button>
                {uploadRejection.code === 'audio.supported_types' ? (
                  <button
                    type='button'
                    onClick={() =>
                      handleRequestType({
                        ...uploadRejection,
                        cta: {
                          label: 'Request this type',
                          action: 'request_type',
                        },
                      })
                    }
                    className='rounded-md px-2 py-1 text-2xs font-medium text-secondary-token transition-colors duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55'
                    data-testid='upload-request-type-cta'
                  >
                    Request this type
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {uploadError ? (
            <p className='text-error' data-testid='upload-generic-error'>
              {uploadError}
            </p>
          ) : null}
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
