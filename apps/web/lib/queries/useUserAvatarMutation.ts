'use client';

import * as Sentry from '@sentry/nextjs';
import { useAvatarUploadMutation } from './useAvatarUploadMutation';

export interface UseUserAvatarMutationOptions {
  onSuccess?: (blobUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * TanStack Query mutation hook for uploading user avatars.
 *
 * This is a lightweight hook for standalone avatar uploads.
 * For profile avatar updates that also update the profile record,
 * use `useAvatarMutation` from `useProfileMutation.ts`.
 *
 * @example
 * const { mutate: uploadAvatar, isPending } = useUserAvatarMutation({
 *   onSuccess: (url) => console.log('Uploaded:', url),
 *   onError: (err) => console.error(err),
 * });
 *
 * uploadAvatar(file);
 */
export function useUserAvatarMutation(
  options: UseUserAvatarMutationOptions = {}
) {
  const { onSuccess, onError } = options;

  return useAvatarUploadMutation({
    onSuccess: blobUrl => {
      onSuccess?.(blobUrl);
    },
    onError: error => {
      const normalizedError =
        error instanceof Error ? error : new Error('Upload failed');

      // Don't report abort errors to Sentry — these happen when users navigate away
      const isAbortError =
        normalizedError.name === 'AbortError' ||
        normalizedError.message.includes('aborted');

      if (!isAbortError) {
        Sentry.captureException(normalizedError, {
          tags: { category: 'avatar_upload', source: 'useUserAvatarMutation' },
        });
      }

      onError?.(normalizedError);
    },
  });
}
