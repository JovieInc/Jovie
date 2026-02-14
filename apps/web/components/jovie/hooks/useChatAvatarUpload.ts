'use client';

import { useCallback, useRef } from 'react';

import { validateAvatarFile } from '@/lib/avatar/validation';
import { useAvatarMutation } from '@/lib/queries/useProfileMutation';

interface UseChatAvatarUploadOptions {
  readonly onUploadSuccess: (message: string) => void;
  readonly onError: (error: string) => void;
  readonly disabled?: boolean;
}

interface UseChatAvatarUploadReturn {
  readonly fileInputRef: React.RefObject<HTMLInputElement | null>;
  readonly isUploading: boolean;
  readonly openFilePicker: () => void;
  readonly handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Chat-specific hook for uploading a profile photo.
 *
 * Wraps the existing `useAvatarMutation` (blob upload + profile update)
 * and `validateAvatarFile` (client-side type/size checks) with a file
 * input ref for use in the chat input area.
 */
export function useChatAvatarUpload({
  onUploadSuccess,
  onError,
  disabled = false,
}: UseChatAvatarUploadOptions): UseChatAvatarUploadReturn {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: uploadAvatar, isPending: isUploading } = useAvatarMutation({
    onSuccess: () => {
      onUploadSuccess('I just updated my profile photo.');
    },
    onError: error => {
      onError(error.message || 'Failed to upload photo. Please try again.');
    },
  });

  const openFilePicker = useCallback(() => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  }, [disabled, isUploading]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset so the same file can be re-selected
      e.target.value = '';

      const validationError = validateAvatarFile(file);
      if (validationError) {
        onError(validationError);
        return;
      }

      uploadAvatar(file);
    },
    [uploadAvatar, onError]
  );

  return { fileInputRef, isUploading, openFilePicker, handleFileChange };
}
