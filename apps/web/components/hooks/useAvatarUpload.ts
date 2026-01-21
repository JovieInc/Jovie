'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UploadErrorCode } from '@/app/api/images/upload/route';
import type { AvatarUploadStatus } from '@/components/molecules/AvatarProgressRing';
import { track } from '@/lib/analytics';
import {
  DEFAULT_ACCEPTED_TYPES,
  DEFAULT_MAX_FILE_SIZE,
  validateAvatarFile,
} from '@/lib/avatar/validation';

export interface UseAvatarUploadProps {
  src?: string | null;
  onUpload?: (file: File) => Promise<string>;
  onError?: (error: string) => void;
  onSuccess?: (imageUrl: string) => void;
  onRetryableError?: (error: string, code: UploadErrorCode) => void;
  maxFileSize?: number;
  acceptedTypes?: readonly string[];
}

export interface UseAvatarUploadReturn {
  isDragOver: boolean;
  isUploading: boolean;
  uploadStatus: AvatarUploadStatus;
  uploadProgress: number;
  previewUrl: string | null;
  handleFileUpload: (file: File) => Promise<void>;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useAvatarUpload({
  src,
  onUpload,
  onError,
  onSuccess,
  onRetryableError,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}: UseAvatarUploadProps): UseAvatarUploadReturn {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<AvatarUploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const statusResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const clearStatusReset = useCallback(() => {
    if (statusResetTimeoutRef.current) {
      clearTimeout(statusResetTimeoutRef.current);
      statusResetTimeoutRef.current = null;
    }
  }, []);

  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const resetStatus = useCallback(
    (delay: number) => {
      clearStatusReset();
      statusResetTimeoutRef.current = setTimeout(() => {
        setUploadStatus('idle');
        statusResetTimeoutRef.current = null;
      }, delay);
    },
    [clearStatusReset]
  );

  const setPreviewFromFile = useCallback((file: File) => {
    const canUseObjectUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

    if (!canUseObjectUrl) {
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(prev => {
      if (
        prev?.startsWith('blob:') &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  }, []);

  // Cleanup blob URLs on unmount
  useEffect(
    () => () => {
      if (
        previewUrl?.startsWith('blob:') &&
        typeof URL !== 'undefined' &&
        typeof URL.revokeObjectURL === 'function'
      ) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  // Cleanup timeout on unmount
  useEffect(() => clearStatusReset, [clearStatusReset]);

  // Cleanup progress interval on unmount
  useEffect(() => clearProgressInterval, [clearProgressInterval]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!onUpload) return;

      clearStatusReset();
      const validationError = validateAvatarFile(
        file,
        maxFileSize,
        acceptedTypes
      );
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
      setUploadProgress(5);
      setPreviewFromFile(file);
      track('avatar_upload_start', {
        file_size: file.size,
        file_type: file.type,
      });

      clearProgressInterval();
      progressIntervalRef.current = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev;
          // Ease out as we approach 90 to avoid jumping to 100 too early
          const increment = Math.max(1, Math.floor((90 - prev) * 0.1));
          return Math.min(90, prev + increment);
        });
      }, 300);

      try {
        const imageUrl = await onUpload(file);
        setUploadStatus('success');
        setUploadProgress(100);
        setPreviewUrl(imageUrl);
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
        // Revert preview to previous image on failure
        setPreviewUrl(null);
        resetStatus(3000);
      } finally {
        clearProgressInterval();
        setIsUploading(false);
        // If we errored, keep progress at 100 for the ring state; otherwise reset when status reset runs
        if (uploadStatus !== 'error') {
          setUploadProgress(0);
        }
      }
    },
    [
      acceptedTypes,
      clearProgressInterval,
      clearStatusReset,
      maxFileSize,
      onError,
      onRetryableError,
      onSuccess,
      onUpload,
      resetStatus,
      setPreviewFromFile,
    ]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onUpload && !isUploading) {
        setIsDragOver(true);
      }
    },
    [onUpload, isUploading]
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

      if (!onUpload || isUploading) return;

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [onUpload, isUploading, handleFileUpload]
  );

  return useMemo(
    () => ({
      isDragOver,
      isUploading,
      uploadStatus,
      previewUrl,
      uploadProgress,
      handleFileUpload,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      containerRef,
    }),
    [
      isDragOver,
      isUploading,
      uploadStatus,
      previewUrl,
      handleFileUpload,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
    ]
  );
}
