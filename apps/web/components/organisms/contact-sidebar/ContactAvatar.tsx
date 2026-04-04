'use client';

import { BadgeCheck } from 'lucide-react';
import { memo } from 'react';
import { toast } from 'sonner';

import { Avatar } from '@/components/molecules/Avatar';
import { EntityHeaderCard } from '@/components/molecules/drawer';
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

  const avatarImage = canUploadAvatar ? (
    <AvatarUploadable
      src={avatarUrl}
      alt={altText}
      name={displayName}
      size='xl'
      uploadable
      onUpload={onAvatarUpload}
      onError={message => {
        toast.error(message || 'Failed to upload avatar. Please try again.');
      }}
      showHoverOverlay
    />
  ) : (
    <Avatar src={avatarUrl} alt={altText} name={displayName} size='xl' />
  );

  return (
    <EntityHeaderCard
      image={avatarImage}
      title={fullName || 'No name'}
      subtitle={formatUsername(username) || 'No username'}
      badge={
        isVerified ? (
          <BadgeCheck
            className='h-4 w-4 shrink-0 text-accent'
            aria-label='Verified'
          />
        ) : undefined
      }
      data-testid='contact-avatar'
    />
  );
});
