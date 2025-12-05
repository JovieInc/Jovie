'use client';

import { useState } from 'react';
import { updateCreatorAvatarAsAdmin } from '@/app/admin/actions';
import { useToast } from '@/components/molecules/ToastContainer';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';

export interface CreatorAvatarCellProps {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  verified?: boolean;
}

export function CreatorAvatarCell({
  profileId,
  username,
  avatarUrl,
  verified = false,
}: CreatorAvatarCellProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    avatarUrl ?? null
  );
  const { showToast } = useToast();

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { error?: string }).error || 'Upload failed';
      throw new Error(message);
    }

    const data = (await response.json()) as { blobUrl: string };
    return data.blobUrl;
  };

  const handleUpload = async (file: File): Promise<string> => {
    const url = await uploadImage(file);

    try {
      await updateCreatorAvatarAsAdmin(profileId, url);
      setPreviewUrl(url);
      showToast({ type: 'success', message: 'Avatar updated' });
    } catch (error) {
      console.error('Failed to update creator avatar as admin', error);
      showToast({
        type: 'error',
        message: 'Failed to update avatar. Please try again.',
      });
      // Re-throw so AvatarUploadable can show error state
      throw error instanceof Error
        ? error
        : new Error('Failed to update avatar');
    }

    return url;
  };

  return (
    <div className='flex items-center gap-2'>
      <AvatarUploadable
        src={previewUrl}
        alt={`Avatar for @${username}`}
        name={username}
        size='sm'
        uploadable
        onUpload={handleUpload}
        onError={message => {
          showToast({
            type: 'error',
            message: message || 'Failed to upload avatar. Please try again.',
          });
        }}
        maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
        acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
        showHoverOverlay
        verified={verified}
      />
    </div>
  );
}
