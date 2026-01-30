'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { useAvatarUploadMutation } from '@/lib/queries/useAvatarUploadMutation';

export interface CreatorAvatarCellProps
  extends Readonly<{
    profileId: string;
    username: string;
    avatarUrl: string | null;
    verified?: boolean;
    isFeatured?: boolean;
  }> {}

export function CreatorAvatarCell({
  profileId,
  username,
  avatarUrl,
  verified = false,
  isFeatured = false,
}: Readonly<CreatorAvatarCellProps>) {
  const notifications = useNotifications();
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    avatarUrl ?? null
  );

  const { mutateAsync: uploadAvatar } = useAvatarUploadMutation();

  const handleUpload = async (file: File): Promise<string> => {
    const result = await uploadAvatar(
      { file, profileId },
      {
        onSuccess: data => {
          setPreviewUrl(data.blobUrl);
          notifications.success('Avatar updated');
        },
        onError: error => {
          // Re-throw so AvatarUploadable can show error state
          throw error instanceof Error
            ? error
            : new Error('Failed to update avatar');
        },
      }
    );

    return result.blobUrl;
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
            notifications.error(
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
