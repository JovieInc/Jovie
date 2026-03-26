'use client';

import { Check, ImagePlus, Loader2, RotateCw, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { validateAvatarFile } from '@/lib/avatar/validation';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import { useAvatarMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export function ChatAvatarUploadCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const previewPanel = usePreviewPanelContext();

  const { mutate: uploadAvatar } = useAvatarMutation({
    onSuccess: (avatarUrl: string) => {
      setState('success');

      // Instantly update sidebar preview with the new avatar
      if (previewPanel?.previewData) {
        previewPanel.setPreviewData({
          ...previewPanel.previewData,
          avatarUrl,
        });
      }
    },
    onError: (err: Error) => {
      setState('error');
      setError(err.message || 'Upload failed. Please try again.');
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateAvatarFile(file);
      if (validationError) {
        setState('error');
        setError(validationError);
        return;
      }
      setState('uploading');
      setError(null);
      uploadAvatar(file);
    },
    [uploadAvatar]
  );

  const handleClick = useCallback(() => {
    if (state === 'uploading') return;
    fileInputRef.current?.click();
  }, [state]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRetry = useCallback(() => {
    setState('idle');
    setError(null);
    fileInputRef.current?.click();
  }, []);

  if (state === 'success') {
    return (
      <ContentSurfaceCard className='border-success/20 bg-[color-mix(in_oklab,var(--color-success)_8%,var(--linear-app-content-surface))] p-4'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>Profile photo updated</span>
        </div>
      </ContentSurfaceCard>
    );
  }

  if (state === 'error') {
    return (
      <ContentSurfaceCard className='border-error/20 bg-[color-mix(in_oklab,var(--color-error)_8%,var(--linear-app-content-surface))] p-4'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-error'>
            <X className='h-4 w-4' />
            <span className='text-sm'>{error}</span>
          </div>
          <button
            type='button'
            onClick={handleRetry}
            className='flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-error transition-colors hover:bg-error/10'
          >
            <RotateCw className='h-3 w-3' />
            Retry
          </button>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
        onChange={handleFileChange}
        className='hidden'
        tabIndex={-1}
      />
      <ContentSurfaceCard className='border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-3'>
        <button
          type='button'
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={state === 'uploading'}
          className={cn(
            'w-full rounded-[9px] border border-dashed p-8 text-center transition-colors',
            isDragOver
              ? 'border-accent bg-accent/10'
              : 'border-(--linear-app-frame-seam) bg-surface-0 hover:border-accent/50 hover:bg-surface-1',
            state === 'uploading' && 'pointer-events-none opacity-60'
          )}
        >
          <div className='flex flex-col items-center gap-3'>
            {state === 'uploading' ? (
              <>
                <Loader2 className='h-8 w-8 animate-spin text-accent' />
                <span className='text-sm text-secondary-token'>
                  Uploading...
                </span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    LINEAR_SURFACE.drawerCardSm,
                    'flex h-10 w-10 items-center justify-center rounded-[8px]'
                  )}
                >
                  <ImagePlus
                    className={cn(
                      'h-5 w-5',
                      isDragOver ? 'text-accent' : 'text-tertiary-token'
                    )}
                  />
                </span>
                <div>
                  <span className='text-sm font-medium text-primary-token'>
                    Drop your photo here or click to upload
                  </span>
                  <p className='mt-1 text-xs text-tertiary-token'>
                    JPEG, PNG, WebP, or HEIC
                  </p>
                </div>
              </>
            )}
          </div>
        </button>
      </ContentSurfaceCard>
    </>
  );
}
