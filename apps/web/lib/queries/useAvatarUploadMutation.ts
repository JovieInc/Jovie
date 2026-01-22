'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

export interface AvatarUploadInput {
  file: File;
  profileId: string;
}

export interface AvatarUploadResponse {
  success: boolean;
  blobUrl: string;
}

/**
 * Mutation function for uploading and updating creator avatar.
 * Performs a two-step operation: upload to blob storage, then update profile.
 */
async function uploadAvatar(
  input: AvatarUploadInput
): Promise<AvatarUploadResponse> {
  const { file, profileId } = input;

  // Step 1: Upload file to blob storage
  const formData = new FormData();
  formData.append('file', file);

  const uploadResponse = await fetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  const uploadJson = (await uploadResponse.json().catch(() => ({}))) as {
    blobUrl?: string;
    error?: string;
  };

  if (!uploadResponse.ok || !uploadJson.blobUrl) {
    throw new Error(uploadJson.error ?? 'Failed to upload avatar');
  }

  const blobUrl = uploadJson.blobUrl;

  // Step 2: Update creator profile with new avatar URL
  const adminResponse = await fetch('/api/admin/creator-avatar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profileId,
      avatarUrl: blobUrl,
    }),
  });

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
 *     onSuccess: (data) => {
 *       toast.success('Avatar updated');
 *       setAvatarUrl(data.blobUrl);
 *     },
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useAvatarUploadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadAvatar,
    onSettled: (_data, _error, variables) => {
      // Invalidate creator detail and list queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.creators.detail(variables.profileId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.creators.all });
    },
  });
}
