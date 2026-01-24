'use client';

import { useMutation } from '@tanstack/react-query';
import { FetchError } from './fetch';

interface AvatarUploadResponse {
  blobUrl: string;
}

/**
 * Upload avatar to blob storage and return the URL.
 */
async function uploadAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new FetchError(
      errorData.error ?? 'Upload failed',
      response.status,
      response
    );
  }

  const { blobUrl } = (await response.json()) as AvatarUploadResponse;
  if (!blobUrl) {
    throw new FetchError('Upload failed: no URL returned', 500);
  }

  return blobUrl;
}

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

  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: blobUrl => {
      onSuccess?.(blobUrl);
    },
    onError: error => {
      onError?.(error instanceof Error ? error : new Error('Upload failed'));
    },
    retry: false, // Don't retry uploads
  });
}
