'use client';

import { useCallback } from 'react';
import { useAvatarUploadMutation } from '@/lib/queries/useAvatarUploadMutation';
import type { Contact } from '@/types';

interface UseAvatarUploadReturn {
  handleAvatarUpload: (file: File, contact: Contact) => Promise<string>;
}

/**
 * Hook to handle avatar upload for admin creator profiles.
 * Uses TanStack Query mutation for cache invalidation.
 */
export function useAvatarUpload(): UseAvatarUploadReturn {
  const avatarUploadMutation = useAvatarUploadMutation();

  const handleAvatarUpload = useCallback(
    async (file: File, contact: Contact): Promise<string> => {
      const result = await avatarUploadMutation.mutateAsync({
        file,
        profileId: contact.id,
      });

      return result.blobUrl;
    },
    [avatarUploadMutation]
  );

  return { handleAvatarUpload };
}
