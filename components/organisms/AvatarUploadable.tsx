'use client';

import { Check, Upload, X } from 'lucide-react';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { UploadErrorCode } from '@/app/api/images/upload/route';
import { Avatar, type AvatarProps } from '@/components/atoms/Avatar';
import { track } from '@/lib/analytics';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  formatAcceptedImageTypes,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
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

// Progress ring SVG constants
const STROKE_WIDTH = 3;
// const RING_SIZE = 100; // Percentage of avatar size (unused for now)
const RADIUS = 50 - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
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

// File validation
const DEFAULT_MAX_FILE_SIZE = AVATAR_MAX_FILE_SIZE_BYTES; // API enforced
const DEFAULT_ACCEPTED_TYPES = SUPPORTED_IMAGE_MIME_TYPES;

const STATUS_COLORS = {
  uploading: 'text-accent-token',
  success: 'text-primary-token',
  error: 'text-destructive',
  idle: 'text-secondary-token',
} as const;

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
 * Validates a file for upload
 */
function validateFile(
  file: File,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes: readonly string[] = DEFAULT_ACCEPTED_TYPES
): string | null {
  const normalizedType = file.type.toLowerCase?.() ?? file.type;
  if (!acceptedTypes.includes(normalizedType)) {
    const allowedTypes = formatAcceptedImageTypes(acceptedTypes);
    return `Invalid file type. Please select ${allowedTypes.join(', ')} files only.`;
  }

  if (file.size > maxFileSize) {
    const sizeMB = Math.round(maxFileSize / (1024 * 1024));
    return `File too large. Please select a file smaller than ${sizeMB}MB.`;
  }

  return null;
}

/**
 * Progress Ring Component for radial upload progress
 */
function ProgressRing({
  progress,
  size,
  status,
}: {
  progress: number;
  size: number;
  status: 'uploading' | 'success' | 'error' | 'idle';
}) {
  const strokeDasharray = `${(progress / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const ringColor = STATUS_COLORS[status];

  return (
    <div
      className='pointer-events-none absolute inset-0 flex items-center justify-center'
      aria-hidden='true'
      data-testid='avatar-uploadable-progress'
    >
      <svg
        width={size}
        height={size}
        viewBox='0 0 100 100'
        className='-rotate-90'
      >
        {/* Background ring */}
        <circle
          cx='50'
          cy='50'
          r={RADIUS}
          fill='none'
          stroke='currentColor'
          strokeWidth={STROKE_WIDTH}
          className='text-border-subtle'
        />
        {/* Progress ring */}
        <circle
          cx='50'
          cy='50'
          r={RADIUS}
          fill='none'
          stroke='currentColor'
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={strokeDasharray}
          strokeLinecap='round'
          className={cn(
            'stroke-current transition-all duration-300 ease-out',
            ringColor
          )}
        />
      </svg>

      {/* Status icons */}
      <div className='absolute inset-0 flex items-center justify-center'>
        {status === 'success' && (
          <div className='rounded-full bg-surface-0 text-primary-token ring-1 ring-[color:var(--color-border-subtle)] shadow-sm'>
            <Check size={size * 0.15} className='p-1' aria-hidden='true' />
          </div>
        )}
        {status === 'error' && (
          <div className='rounded-full bg-surface-0 text-destructive ring-1 ring-[color:var(--color-border-subtle)] shadow-sm'>
            <X size={size * 0.15} className='p-1' aria-hidden='true' />
          </div>
        )}
        {status === 'uploading' && (
          <div className='rounded-full bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] ring-1 ring-[color:var(--color-accent)] shadow-sm animate-pulse'>
            <Upload size={size * 0.15} className='p-1' aria-hidden='true' />
          </div>
        )}
      </div>
    </div>
  );
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
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<
      'idle' | 'uploading' | 'success' | 'error'
    >('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const statusResetTimeoutRef = useRef<number | null>(null);
    const mergedRef = useMemo(
      () => mergeRefs<HTMLDivElement>(containerRef, forwardedRef),
      [forwardedRef]
    );

    const avatarSize = avatarProps.size || 'md';
    const numericSize = SIZE_MAP[avatarSize];
    const acceptedTypeList = useMemo(
      () => acceptedTypes.join(','),
      [acceptedTypes]
    );

    const clearStatusReset = useCallback(() => {
      if (statusResetTimeoutRef.current) {
        window.clearTimeout(statusResetTimeoutRef.current);
        statusResetTimeoutRef.current = null;
      }
    }, []);

    const resetStatus = useCallback(
      (delay: number) => {
        clearStatusReset();
        statusResetTimeoutRef.current = window.setTimeout(() => {
          setUploadStatus('idle');
          statusResetTimeoutRef.current = null;
        }, delay);
      },
      [clearStatusReset]
    );

    const handleFileUpload = useCallback(
      async (file: File) => {
        if (!onUpload) return;

        clearStatusReset();
        const validationError = validateFile(file, maxFileSize, acceptedTypes);
        if (validationError) {
          onError?.(validationError);
          setUploadStatus('error');
          track('avatar_upload_error', {
            error: 'validation_failed',
            message: validationError,
          });
          resetStatus(3000);
          return;
        }

        setIsUploading(true);
        setUploadStatus('uploading');
        track('avatar_upload_start', {
          file_size: file.size,
          file_type: file.type,
        });

        try {
          const imageUrl = await onUpload(file);
          setUploadStatus('success');
          onSuccess?.(imageUrl);
          track('avatar_upload_success', { file_size: file.size });
          resetStatus(2000);
        } catch (error) {
          // Handle structured error responses
          const errorData = error as {
            message?: string;
            code?: UploadErrorCode;
            retryable?: boolean;
          };
          const errorMessage = errorData.message ?? 'Upload failed';
          const errorCode = errorData.code;
          const isRetryable = errorData.retryable ?? false;

          setUploadStatus('error');
          onError?.(errorMessage);

          if (isRetryable && errorCode && onRetryableError) {
            onRetryableError(errorMessage, errorCode);
          }

          track('avatar_upload_error', {
            error: errorCode ?? 'upload_failed',
            message: errorMessage,
            retryable: isRetryable,
          });
          resetStatus(3000);
        } finally {
          setIsUploading(false);
        }
      },
      [
        acceptedTypes,
        clearStatusReset,
        maxFileSize,
        onError,
        onRetryableError,
        onSuccess,
        onUpload,
        resetStatus,
      ]
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

    const handleDragEnter = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploadable && onUpload && !isUploading) {
          setIsDragOver(true);
        }
      },
      [uploadable, onUpload, isUploading]
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (!uploadable || !onUpload || isUploading) return;

        const file = e.dataTransfer.files?.[0];
        if (file) {
          handleFileUpload(file);
        }
      },
      [uploadable, onUpload, isUploading, handleFileUpload]
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

    useEffect(() => clearStatusReset, [clearStatusReset]);

    const canUpload = uploadable && Boolean(onUpload);
    const isInteractive = canUpload && !isUploading;
    const showProgress =
      isUploading || uploadStatus === 'success' || uploadStatus === 'error';
    const currentProgress =
      uploadStatus === 'success' || uploadStatus === 'error' ? 100 : progress;

    return (
      <div
        ref={mergedRef}
        className={cn(
          'relative group outline-none',
          isInteractive ? 'cursor-pointer focus-ring' : 'cursor-default',
          className
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={isInteractive ? 0 : undefined}
        role={isInteractive ? 'button' : undefined}
        aria-label={isInteractive ? 'Upload profile photo' : undefined}
        aria-disabled={!isInteractive}
        aria-busy={isUploading}
      >
        <Avatar
          src={src}
          className={cn(
            'transition-all duration-200 ease-out',
            isInteractive &&
              'group-hover:brightness-95 group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--color-accent)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[color:var(--color-bg-base)]',
            isDragOver && 'scale-105',
            isUploading && 'opacity-80'
          )}
          {...avatarProps}
        />

        {isInteractive && showHoverOverlay && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-full',
              'bg-surface-3/80 text-primary-token ring-1 ring-[color:var(--color-border-subtle)] backdrop-blur',
              'opacity-0 transition-opacity duration-200 group-hover:opacity-100',
              avatarProps.rounded !== 'full' && 'rounded-lg'
            )}
            aria-hidden='true'
            data-testid='avatar-uploadable-hover-overlay'
          >
            <Upload size={numericSize * 0.3} />
          </div>
        )}

        {isDragOver && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-full',
              'bg-[color:var(--color-accent)]/90 text-[color:var(--color-accent-foreground)]',
              'border-2 border-[color:var(--color-accent)] shadow-md transition-transform duration-200',
              avatarProps.rounded !== 'full' && 'rounded-lg'
            )}
            aria-hidden='true'
            data-testid='avatar-uploadable-drag-overlay'
          >
            <Upload size={numericSize * 0.4} />
          </div>
        )}

        {showProgress && (
          <ProgressRing
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

        {progress > 0 && (
          <div className='sr-only' aria-live='polite' aria-atomic='true'>
            Uploading profile photo: {Math.round(progress)}% complete
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className='sr-only' aria-live='polite'>
            Profile photo uploaded successfully
          </div>
        )}

        {uploadStatus === 'error' && (
          <div className='sr-only' aria-live='assertive'>
            Profile photo upload failed
          </div>
        )}
      </div>
    );
  })
);

AvatarUploadable.displayName = 'AvatarUploadable';
