'use client';

import { useCallback, useRef } from 'react';
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

  // Ref to avoid recreating callback when mutation object changes reference
  const mutateAsyncRef = useRef(avatarUploadMutation.mutateAsync);
  // eslint-disable-next-line react-hooks/refs -- stable ref read for callback
  mutateAsyncRef.current = avatarUploadMutation.mutateAsync;

  const handleAvatarUpload = useCallback(
    async (file: File, contact: Contact): Promise<string> => {
      const result = await mutateAsyncRef.current({
        file,
        profileId: contact.id,
      });

      return result.blobUrl;
    },
    []
  );

  return { handleAvatarUpload };
}
