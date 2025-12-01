'use client';

import { useCallback, useRef } from 'react';
import { AvatarUploadable } from '@/components/molecules/AvatarUploadable';
import { useToast } from '@/components/molecules/ToastContainer';
import { cn } from '@/lib/utils';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  artistName: string;
  onUploadSuccess?: (imageUrl: string) => void;
  onUploadError?: (error: string) => void;
  className?: string;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

export function AvatarUpload({
  currentAvatarUrl,
  artistName,
  onUploadSuccess,
  onUploadError,
  className,
}: AvatarUploadProps) {
  const { showToast } = useToast();
  const uploadableRef = useRef<HTMLDivElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Upload failed');
    }

    const { blobUrl } = (await response.json()) as { blobUrl: string };
    return blobUrl;
  }, []);

  const handleSuccess = useCallback(
    (url: string) => {
      showToast({
        type: 'success',
        message: 'Profile photo updated successfully!',
      });
      onUploadSuccess?.(url);
    },
    [onUploadSuccess, showToast]
  );

  const handleError = useCallback(
    (message: string) => {
      showToast({
        type: 'error',
        message,
      });
      onUploadError?.(message);
    },
    [onUploadError, showToast]
  );

  return (
    <div className={cn('flex items-start gap-6', className)}>
      <AvatarUploadable
        ref={uploadableRef}
        src={currentAvatarUrl}
        alt={artistName}
        name={artistName}
        size='xl'
        uploadable
        onUpload={handleUpload}
        onSuccess={handleSuccess}
        onError={handleError}
        maxFileSize={MAX_FILE_SIZE}
        acceptedTypes={ACCEPTED_TYPES}
        showHoverOverlay
        className='shrink-0'
      />

      <div className='flex-1 space-y-3'>
        <button
          type='button'
          onClick={() => uploadableRef.current?.click()}
          className='inline-flex items-center justify-center rounded-md border border-subtle bg-surface-1 px-4 py-2 text-sm font-medium text-primary-token transition-colors hover:bg-surface-2 focus-ring'
        >
          Upload photo
        </button>

        <p className='text-sm text-secondary-token'>
          JPG, PNG or WebP. Max size 4MB. Square images work best.
        </p>

        <p className='text-xs text-tertiary-token'>
          If upload fails, a default avatar will be used automatically.
        </p>
      </div>
    </div>
  );
}
