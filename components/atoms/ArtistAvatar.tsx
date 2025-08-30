'use client';

import React, { useMemo } from 'react';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

export interface ArtistAvatarProps {
  src: string;
  alt: string;
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
  alt,
  name,
  size = 'md',
  priority = false,
  className = '',
}: ArtistAvatarProps) {
  // Use useMemo to ensure stable props for the OptimizedImage component
  const sizeProps = useMemo(() => SIZE_MAP[size], [size]);

  const { width, height, className: sizeClass } = sizeProps;

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      aspectRatio='square'
      objectFit='cover'
      objectPosition='center'
      priority={priority}
      quality={85}
      placeholder='blur'
      sizes={`(max-width: 768px) ${width}px, ${width}px`}
      className={`${sizeClass} ring-1 ring-black/10 dark:ring-white/15 shadow-md group-hover:ring-white/20 ${className}`}
      shape='circle'
      artistName={name}
      imageType='avatar'
      enableVersioning={true}
    />
  );
});
