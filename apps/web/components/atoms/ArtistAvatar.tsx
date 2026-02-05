'use client';

import React from 'react';
import { Avatar, type AvatarProps } from '@/components/molecules/Avatar';

/**
 * @deprecated Use `Avatar` directly. This wrapper preserves legacy sizing while delegating to the unified Avatar.
 */
export interface ArtistAvatarProps {
  readonly src?: string | null;
  readonly alt?: string;
  readonly name: string;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly priority?: boolean;
  readonly className?: string;
}

const SIZE_MAP: Record<
  NonNullable<ArtistAvatarProps['size']>,
  AvatarProps['size']
> = {
  sm: 'display-sm',
  md: 'display-lg',
  lg: 'display-xl',
  xl: 'display-2xl',
};

export const ArtistAvatar = React.memo(function ArtistAvatar({
  src,
  name,
  alt = name,
  size = 'md',
  priority = false,
  className,
}: ArtistAvatarProps) {
  return (
    <Avatar
      src={src}
      alt={alt}
      name={name}
      size={SIZE_MAP[size]}
      priority={priority}
      className={className}
    />
  );
});
