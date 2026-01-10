'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { UploadErrorCode } from '@/app/api/images/upload/route';
import { Avatar, type AvatarProps } from '@/components/atoms/Avatar';
import { AvatarUploadAnnouncer } from '@/components/atoms/AvatarUploadAnnouncer';
import { AvatarUploadOverlay } from '@/components/atoms/AvatarUploadOverlay';
import { useAvatarUpload } from '@/components/hooks/useAvatarUpload';
import { AvatarProgressRing } from '@/components/molecules/AvatarProgressRing';
import { track } from '@/lib/analytics';
import {
  DEFAULT_ACCEPTED_TYPES,
  DEFAULT_MAX_FILE_SIZE,
} from '@/lib/avatar/validation';
import { cn } from '@/lib/utils';

export interface AvatarUploadableProps extends Omit<AvatarProps, 'src'> {
  /** Current avatar image URL */
  src?: string | null;
  /** Whether uploading is enabled (controlled by feature flag) */
  uploadable?: boolean;
  /** Upload callback that returns a promise with the new image URL */
  onUpload?: (file: File) => Promise<string>;
  /** Progress percentage (0-100) for upload progress */
  progress?: number;
  /** Error callback */
  onError?: (error: string) => void;
  /** Success callback with new image URL */
  onSuccess?: (imageUrl: string) => void;
  /** Retry callback when upload fails with retryable error */
  onRetryableError?: (error: string, code: UploadErrorCode) => void;
  /** Maximum file size in bytes (default: 4MB, aligned with /api/images/upload) */
  maxFileSize?: number;
  /** Accepted file types */
  acceptedTypes?: readonly string[];
  /** Whether to show hover overlay when uploadable */
  showHoverOverlay?: boolean;
}

const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
  '2xl': 96,
  'display-sm': 112,
  'display-md': 128,
  'display-lg': 160,
  'display-xl': 192,
  'display-2xl': 224,
  'display-3xl': 256,
  'display-4xl': 384,
};

function mergeRefs<T>(...refs: Array<React.Ref<T>>) {
  return (node: T) => {
    refs.forEach(ref => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    });
  };
}

/**
 * Uploadable Avatar component with radial progress and drag/drop
 *
 * Features:
 * - Radial progress arc around avatar during upload
 * - Drag & drop file upload
 * - Click to upload with file picker
 * - File validation with user-friendly errors
 * - Success/error states with visual feedback
 * - Keyboard accessibility
 * - Analytics tracking
 * - Feature flag controlled
 */
export const AvatarUploadable = React.memo(
  forwardRef<HTMLDivElement, AvatarUploadableProps>(function AvatarUploadable(
    {
      src,
      uploadable = false,
      onUpload,
      progress = 0,
      onError,
      onSuccess,
      onRetryableError,
      maxFileSize = DEFAULT_MAX_FILE_SIZE,
      acceptedTypes = DEFAULT_ACCEPTED_TYPES,
      showHoverOverlay = true,
      className,
      ...avatarProps
    },
    forwardedRef
  ) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
      isDragOver,
      isUploading,
      uploadStatus,
      previewUrl,
      handleFileUpload,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      containerRef,
    } = useAvatarUpload({
      src,
      onUpload,
      onError,
      onSuccess,
      onRetryableError,
      maxFileSize,
      acceptedTypes,
    });

    const mergedRef = useMemo(
      () => mergeRefs<HTMLDivElement>(containerRef, forwardedRef),
      [containerRef, forwardedRef]
    );

    const avatarSize = avatarProps.size || 'md';
    const numericSize = SIZE_MAP[avatarSize];
    const acceptedTypeList = useMemo(
      () => acceptedTypes.join(','),
      [acceptedTypes]
    );

    const handleFileSelect = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          handleFileUpload(file);
        }
      },
      [handleFileUpload]
    );

    const handleClick = useCallback(() => {
      if (uploadable && onUpload && !isUploading) {
        fileInputRef.current?.click();
      }
    }, [uploadable, onUpload, isUploading]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (
          uploadable &&
          onUpload &&
          !isUploading &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      },
      [uploadable, onUpload, isUploading]
    );

    useEffect(() => {
      if (isUploading && progress > 0) {
        track('avatar_upload_progress', { progress });
      }
    }, [isUploading, progress]);

    const canUpload = uploadable && Boolean(onUpload);
    const isInteractive = canUpload && !isUploading;
    const showProgress =
      isUploading || uploadStatus === 'success' || uploadStatus === 'error';
    const currentProgress =
      uploadStatus === 'success' || uploadStatus === 'error' ? 100 : progress;

    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive avatar upload component
      // biome-ignore lint/a11y/noStaticElementInteractions: Custom interactive avatar upload component
      // biome-ignore lint/a11y/useAriaPropsSupportedByRole: ARIA props needed for drag and drop accessibility
      <div
        ref={mergedRef}
        className={cn(
          'relative group/avatar outline-none',
          isInteractive ? 'cursor-pointer focus-ring' : 'cursor-default',
          className
        )}
        onDragEnter={canUpload ? handleDragEnter : undefined}
        onDragLeave={canUpload ? handleDragLeave : undefined}
        onDragOver={canUpload ? handleDragOver : undefined}
        onDrop={canUpload ? handleDrop : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={isInteractive ? 0 : undefined}
        role={isInteractive ? 'button' : undefined}
        aria-label={isInteractive ? 'Upload profile photo' : undefined}
        aria-disabled={!isInteractive}
        aria-busy={isUploading}
      >
        <Avatar
          src={previewUrl ?? src}
          className={cn(
            'transition-all duration-200 ease-out',
            isInteractive &&
              'group-hover/avatar:brightness-95 group-focus-visible/avatar:ring-2 group-focus-visible/avatar:ring-accent group-focus-visible/avatar:ring-offset-2 group-focus-visible/avatar:ring-offset-(--color-bg-base)',
            isDragOver && 'scale-105',
            isUploading && 'opacity-80'
          )}
          {...avatarProps}
        />

        {isInteractive && showHoverOverlay && !isDragOver && (
          <AvatarUploadOverlay iconSize={numericSize * 0.3} />
        )}

        {isDragOver && (
          <AvatarUploadOverlay iconSize={numericSize * 0.3} isDragOver />
        )}

        {showProgress && (
          <AvatarProgressRing
            progress={Math.min(100, Math.max(0, currentProgress))}
            size={numericSize}
            status={uploadStatus}
          />
        )}

        {canUpload && (
          <input
            ref={fileInputRef}
            type='file'
            accept={acceptedTypeList}
            onChange={handleFileSelect}
            className='sr-only'
            aria-label='Choose profile photo file'
          />
        )}

        <AvatarUploadAnnouncer progress={progress} status={uploadStatus} />
      </div>
    );
  })
);

AvatarUploadable.displayName = 'AvatarUploadable';
