'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { updateCreatorAvatarAsAdmin } from '@/app/admin/actions';
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
  isFeatured?: boolean;
}

export function CreatorAvatarCell({
  profileId,
  username,
  avatarUrl,
  verified = false,
  isFeatured = false,
}: CreatorAvatarCellProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    avatarUrl ?? null
  );

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
      toast.success('Avatar updated');
    } catch (error) {
      console.error('Failed to update creator avatar as admin', error);
      toast.error('Failed to update avatar. Please try again.');
      // Re-throw so AvatarUploadable can show error state
      throw error instanceof Error
        ? error
        : new Error('Failed to update avatar');
    }

    return url;
  };

  return (
    <div className='flex items-center gap-2'>
      <div className='relative'>
        <AvatarUploadable
          src={previewUrl}
          alt={`Avatar for @${username}`}
          name={username}
          size='sm'
          uploadable
          onUpload={handleUpload}
          onError={message => {
            toast.error(
              message || 'Failed to upload avatar. Please try again.'
            );
          }}
          maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
          acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
          showHoverOverlay
          verified={verified}
        />
        {isFeatured && (
          <div className='absolute -top-1 -left-1'>
            <Star className='h-3 w-3 text-yellow-400 dark:text-yellow-300 fill-current' />
          </div>
        )}
      </div>
    </div>
  );
}
