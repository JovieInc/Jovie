'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FetchError, fetchWithTimeoutResponse } from './fetch';
import { queryKeys } from './keys';

export interface AvatarUploadInput {
  file: File;
  profileId: string;
}

export interface AvatarUploadResponse {
  success: boolean;
  blobUrl: string;
}

export interface UseAvatarUploadMutationOptions {
  profileId?: string;
  onSuccess?: (blobUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Mutation function for uploading and updating creator avatar.
 * Performs a two-step operation: upload to blob storage, then update profile.
 */
export async function uploadAvatarToBlob(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const uploadResponse = await fetchWithTimeoutResponse('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  const uploadJson = (await uploadResponse.json().catch(() => ({}))) as {
    blobUrl?: string;
    error?: string;
  };

  if (!uploadResponse.ok) {
    throw new FetchError(
      uploadJson.error ?? 'Failed to upload avatar',
      uploadResponse.status,
      uploadResponse
    );
  }

  if (!uploadJson.blobUrl) {
    throw new FetchError('Upload failed: no URL returned', 500);
  }

  return uploadJson.blobUrl;
}

export async function updateCreatorAvatar(
  input: AvatarUploadInput
): Promise<AvatarUploadResponse> {
  const { file, profileId } = input;

  const blobUrl = await uploadAvatarToBlob(file);

  // Step 2: Update creator profile with new avatar URL
  const adminResponse = await fetchWithTimeoutResponse(
    '/api/admin/creator-avatar',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profileId,
        avatarUrl: blobUrl,
      }),
    }
  );

  if (!adminResponse.ok) {
    const adminJson = (await adminResponse.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(adminJson.error ?? 'Failed to update creator avatar');
  }

  return {
    success: true,
    blobUrl,
  };
}

/**
 * TanStack Query mutation hook for uploading creator avatars.
 *
 * @example
 * const { mutate: uploadAvatar, isPending } = useAvatarUploadMutation();
 *
 * uploadAvatar(
 *   { file: selectedFile, profileId: '123' },
 *   {
 *     onSuccess: (blobUrl) => {
 *       toast.success('Avatar updated');
 *       setAvatarUrl(blobUrl);
 *     },
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useAvatarUploadMutation(
  options: UseAvatarUploadMutationOptions = {}
) {
  const queryClient = useQueryClient();
  const { profileId, onSuccess, onError } = options;

  return useMutation({
    mutationFn: async (input: AvatarUploadInput | File): Promise<string> => {
      if (input instanceof File) {
        return uploadAvatarToBlob(input);
      }

      const response = await updateCreatorAvatar(input);
      return response.blobUrl;
    },
    onSuccess: blobUrl => {
      onSuccess?.(blobUrl);
    },
    onError: error => {
      onError?.(error instanceof Error ? error : new Error('Upload failed'));
    },
    onSettled: (_data, _error, variables) => {
      const resolvedProfileId =
        profileId ??
        (variables instanceof File ? undefined : variables.profileId);

      if (resolvedProfileId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.creators.detail(resolvedProfileId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
      }
    },
    retry: false,
  });
}
