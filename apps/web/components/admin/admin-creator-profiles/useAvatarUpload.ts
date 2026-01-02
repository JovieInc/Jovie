'use client';

import { useCallback } from 'react';
import type { Contact } from '@/types';

interface UseAvatarUploadReturn {
  handleAvatarUpload: (file: File, contact: Contact) => Promise<string>;
}

/**
 * Hook to handle avatar upload for admin creator profiles.
 */
export function useAvatarUpload(): UseAvatarUploadReturn {
  const handleAvatarUpload = useCallback(
    async (file: File, contact: Contact): Promise<string> => {
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
        const message = uploadJson.error || 'Failed to upload avatar';
        throw new Error(message);
      }

      const blobUrl = uploadJson.blobUrl;

      const adminResponse = await fetch('/api/admin/creator-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: contact.id,
          avatarUrl: blobUrl,
        }),
      });

      if (!adminResponse.ok) {
        const adminJson = (await adminResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        const message = adminJson.error || 'Failed to update creator avatar';
        throw new Error(message);
      }

      return blobUrl;
    },
    []
  );

  return { handleAvatarUpload };
}
