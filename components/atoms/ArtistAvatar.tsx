'use client';

import Image from 'next/image';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ArtistAvatarProps {
  src: string;
  alt?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  priority?: boolean;
  className?: string;
}

// Define size map outside component to prevent recreation
const SIZE_MAP = {
  sm: { width: 112, height: 112, className: 'size-28' },
  md: { width: 160, height: 160, className: 'size-40' },
  lg: { width: 192, height: 192, className: 'size-48' },
  xl: { width: 224, height: 224, className: 'size-56' },
};

export const ArtistAvatar = React.memo(function ArtistAvatar({
  src,
  name,
  alt = name,
  size = 'md',
  priority = false,
  className,
}: ArtistAvatarProps) {
  const { width, height, className: sizeClass } = SIZE_MAP[size];
  const [hasError, setHasError] = useState(false);

  const initials = name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (hasError || !src) {
    return (
      <div
        className={cn(
          sizeClass,
          'flex items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ring-1 ring-black/10 dark:ring-white/15 shadow-md group-hover:ring-white/20',
          className
        )}
      >
        <span className='text-xl font-medium'>{initials}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      quality={85}
      sizes={`(max-width: 768px) ${width}px, ${width}px`}
      className={cn(
        sizeClass,
        'rounded-full object-cover object-center ring-1 ring-black/10 dark:ring-white/15 shadow-md group-hover:ring-white/20',
        className
      )}
      onError={() => setHasError(true)}
    />
  );
});
