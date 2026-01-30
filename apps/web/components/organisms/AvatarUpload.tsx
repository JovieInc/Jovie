'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  formatAcceptedImageTypes,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { useUserAvatarMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface AvatarUploadProps {
  readonly currentAvatarUrl?: string | null;
  readonly artistName: string;
  readonly onUploadSuccess?: (imageUrl: string) => void;
  readonly onUploadError?: (error: string) => void;
  readonly className?: string;
}

const ACCEPTED_TYPES = SUPPORTED_IMAGE_MIME_TYPES;
const ACCEPTED_TYPE_LABEL = formatAcceptedImageTypes(ACCEPTED_TYPES).join(', ');
const MAX_FILE_SIZE = AVATAR_MAX_FILE_SIZE_BYTES;

export function AvatarUpload({
  currentAvatarUrl,
  artistName,
  onUploadSuccess,
  onUploadError,
  className,
}: AvatarUploadProps) {
  const uploadableRef = useRef<HTMLButtonElement>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Note: We don't use mutation callbacks here because AvatarUploadable
  // handles success/error via its own onSuccess/onError props
  const { mutateAsync: uploadAvatar, isPending: isUploading } =
    useUserAvatarMutation();

  const handleUpload = useCallback(
    async (file: File) => {
      setLastError(null);
      return uploadAvatar(file);
    },
    [uploadAvatar]
  );

  const handleSuccess = useCallback(
    (url: string) => {
      setLastError(null);
      toast.success('Profile photo updated');
      onUploadSuccess?.(url);
    },
    [onUploadSuccess]
  );

  const handleError = useCallback(
    (message: string) => {
      setLastError(message);
      toast.error(message);
      onUploadError?.(message);
    },
    [onUploadError]
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
          disabled={isUploading}
          className='inline-flex items-center justify-center rounded-md border border-subtle bg-surface-1 px-4 py-2 text-sm font-medium text-primary-token transition-colors hover:bg-surface-2 focus-ring disabled:cursor-not-allowed disabled:opacity-60'
        >
          {isUploading ? 'Uploading…' : 'Upload photo'}
        </button>

        <p className='text-sm text-secondary-token'>
          {ACCEPTED_TYPE_LABEL} accepted. Auto-optimized to AVIF/WebP (JPEG
          fallback). Max size 25MB. Square images work best.
        </p>

        <div className='space-y-1 text-xs text-tertiary-token'>
          <p>If upload fails, a default avatar will be used automatically.</p>
          {isUploading && (
            <p className='text-secondary-token'>
              Uploading… please keep this tab open.
            </p>
          )}
          {lastError && (
            <p className='text-destructive' role='alert'>
              {lastError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
