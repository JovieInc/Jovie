'use client';

/**
 * ContactAvatar Component
 *
 * Avatar section showing contact's profile picture and basic info
 */

import { Avatar } from '@/components/atoms/Avatar';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';

import { formatUsername } from './utils';

interface ContactAvatarProps {
  avatarUrl: string | null;
  fullName: string;
  username: string;
  canUploadAvatar: boolean;
  onAvatarUpload?: (file: File) => void;
}

export function ContactAvatar({
  avatarUrl,
  fullName,
  username,
  canUploadAvatar,
  onAvatarUpload,
}: ContactAvatarProps) {
  const altText = fullName ? `${fullName}'s avatar` : 'Contact avatar';
  const displayName = fullName || username;

  return (
    <div className='flex items-center gap-3' data-testid='contact-avatar'>
      {canUploadAvatar ? (
        <AvatarUploadable
          src={avatarUrl}
          alt={altText}
          name={displayName}
          size='lg'
          uploadable={canUploadAvatar}
          onUpload={canUploadAvatar ? onAvatarUpload : undefined}
          showHoverOverlay
        />
      ) : (
        <Avatar src={avatarUrl} alt={altText} name={displayName} size='lg' />
      )}
      <div className='min-w-0 flex-1'>
        <div className='text-sm font-medium truncate'>{fullName}</div>
        <div className='text-xs text-sidebar-muted truncate'>
          {formatUsername(username) || 'No username'}
        </div>
      </div>
    </div>
  );
}
