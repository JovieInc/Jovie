'use client';

import React, { forwardRef, useMemo, useState } from 'react';
import { Avatar } from '@/components/atoms/Avatar';

export interface AvatarWithFallbackProps {
  readonly src?: string | null;
  readonly alt: string;
  readonly name?: string;
  readonly size?:
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | 'display-sm'
    | 'display-md'
    | 'display-lg'
    | 'display-xl'
    | 'display-2xl'
    | 'display-3xl'
    | 'display-4xl';
  readonly rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  readonly verified?: boolean;
  readonly priority?: boolean;
  readonly quality?: number;
  readonly className?: string;
  readonly style?: React.ComponentPropsWithoutRef<'div'>['style'];
}

const SIZE_MAP = {
  xs: { width: 24, height: 24, className: 'size-6', textSize: 'text-xs' },
  sm: { width: 32, height: 32, className: 'size-8', textSize: 'text-sm' },
  md: { width: 48, height: 48, className: 'size-12', textSize: 'text-base' },
  lg: { width: 64, height: 64, className: 'size-16', textSize: 'text-lg' },
  xl: { width: 80, height: 80, className: 'size-20', textSize: 'text-xl' },
  '2xl': { width: 96, height: 96, className: 'size-24', textSize: 'text-2xl' },
  'display-sm': {
    width: 112,
    height: 112,
    className: 'size-28',
    textSize: 'text-xl',
  },
  'display-md': {
    width: 128,
    height: 128,
    className: 'size-32',
    textSize: 'text-2xl',
  },
  'display-lg': {
    width: 160,
    height: 160,
    className: 'size-40',
    textSize: 'text-3xl',
  },
  'display-xl': {
    width: 192,
    height: 192,
    className: 'size-48',
    textSize: 'text-3xl',
  },
  'display-2xl': {
    width: 224,
    height: 224,
    className: 'size-56',
    textSize: 'text-4xl',
  },
  'display-3xl': {
    width: 256,
    height: 256,
    className: 'size-64',
    textSize: 'text-4xl',
  },
  'display-4xl': {
    width: 384,
    height: 384,
    className: 'size-96',
    textSize: 'text-5xl',
  },
} as const;

const ROUNDED_MAP = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

const BLUR_DATA_URLS = {
  24: '',
  32: '',
  48: '',
  64: '',
  80: '',
  96: '',
} as const;

function generateInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const AvatarWithFallback = React.memo(
  forwardRef<HTMLDivElement, AvatarWithFallbackProps>(
    function AvatarWithFallback(
      {
        src,
        alt,
        name,
        size = 'md',
        rounded = 'full',
        verified = false,
        priority = false,
        quality = 85,
        className,
        style,
      },
      ref
    ) {
      const [hasError, setHasError] = useState(false);
      const [isLoaded, setIsLoaded] = useState(false);

      const { width, height, className: sizeClass, textSize } = SIZE_MAP[size];
      const roundedClass = ROUNDED_MAP[rounded];
      const blurDataURL = useMemo(
        () => BLUR_DATA_URLS[width as keyof typeof BLUR_DATA_URLS],
        [width]
      );
      const initials = generateInitials(name);
      const badgeSize: 'sm' | 'md' | 'lg' =
        size === 'xs' || size === 'sm'
          ? 'sm'
          : size === 'md' || size === 'lg' || size === 'xl' || size === '2xl'
            ? 'md'
            : 'lg';

      return (
        <Avatar
          ref={ref}
          src={src}
          alt={alt}
          initials={initials}
          sizeClass={sizeClass}
          textSize={textSize}
          roundedClass={roundedClass}
          badgeSize={badgeSize}
          verified={verified}
          className={className}
          style={style}
          width={width}
          height={height}
          isLoaded={isLoaded}
          showFallback={!src || hasError}
          priority={priority}
          quality={quality}
          blurDataURL={blurDataURL || undefined}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      );
    }
  )
);

AvatarWithFallback.displayName = 'AvatarWithFallback';
