'use client';

/**
 * ContactAvatar Component
 *
 * Avatar section showing contact's profile picture and basic info
 */

import { BadgeCheck } from 'lucide-react';
import { memo } from 'react';

import { Avatar } from '@/components/atoms/Avatar';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';

import { formatUsername } from './utils';

interface ContactAvatarProps {
  readonly avatarUrl: string | null;
  readonly fullName: string;
  readonly username: string;
  readonly isVerified?: boolean;
  readonly canUploadAvatar: boolean;
  readonly onAvatarUpload?: (file: File) => Promise<string>;
}

export const ContactAvatar = memo(function ContactAvatar({
  avatarUrl,
  fullName,
  username,
  isVerified = false,
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
        <div className='flex items-center gap-1'>
          <span className='text-sm font-medium truncate'>{fullName}</span>
          {isVerified && (
            <BadgeCheck
              className='h-4 w-4 shrink-0 text-blue-500'
              aria-label='Verified'
            />
          )}
        </div>
        <div className='text-xs text-sidebar-muted truncate'>
          {formatUsername(username) || 'No username'}
        </div>
      </div>
    </div>
  );
});
