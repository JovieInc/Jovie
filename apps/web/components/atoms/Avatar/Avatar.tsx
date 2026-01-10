'use client';

import Image from 'next/image';
import React, { forwardRef, useMemo, useState } from 'react';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  /** Avatar image source URL */
  src?: string | null;
  /** Alt text for the image */
  alt: string;
  /** Display name for fallback initials */
  name?: string;
  /** Avatar size */
  size?:
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
  /** Border radius style */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** Whether this avatar represents a verified profile */
  verified?: boolean;
  /** Loading priority for Next.js Image */
  priority?: boolean;
  /** Image quality */
  quality?: number;
  /** Fallback image URL */
  fallbackSrc?: string;
  /** Custom className */
  className?: string;
  /** Custom styling */
  style?: React.ComponentPropsWithoutRef<'div'>['style'];
}

// Size mappings with consistent design system values
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

// Rounded corner mappings
const ROUNDED_MAP = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

// Blur data URLs for different sizes for optimized loading
const BLUR_DATA_URLS = {
  24: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  32: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  48: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  64: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  80: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  96: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
} as const;

/**
 * Generate initials from a name string
 */
function generateInitials(name?: string): string {
  if (!name) return '?';

  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Unified Avatar component for display-only usage
 *
 * This component handles:
 * - Multiple sizes with consistent design system values
 * - Fallback initials when image fails to load
 * - Optimized loading with blur placeholders
 * - Accessibility support with proper ARIA attributes
 * - Dark mode support
 */
const BORDER_RING = '';

const AvatarComponent = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  {
    src,
    alt,
    name,
    size = 'md',
    rounded = 'full',
    verified = false,
    priority = false,
    quality = 85,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fallbackSrc: _fallbackSrc = '/android-chrome-192x192.png', // Currently unused - for future fallback image feature
    className,
    style,
  },
  ref
) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { width, height, className: sizeClass, textSize } = SIZE_MAP[size];
  const roundedClass = ROUNDED_MAP[rounded];
  const blurDataURL = useMemo(() => {
    if (BLUR_DATA_URLS[width as keyof typeof BLUR_DATA_URLS]) {
      return BLUR_DATA_URLS[width as keyof typeof BLUR_DATA_URLS];
    }
    // Fallback to the largest available blur placeholder
    return BLUR_DATA_URLS[96] || BLUR_DATA_URLS[48];
  }, [width]);
  const initials = generateInitials(name);

  // Map avatar size to a sensible badge size
  const badgeSize: 'sm' | 'md' | 'lg' =
    size === 'xs' || size === 'sm'
      ? 'sm'
      : size === 'md' || size === 'lg' || size === 'xl' || size === '2xl'
        ? 'md'
        : 'lg';

  // Show fallback if no src or error occurred
  const shouldShowFallback = !src || hasError;

  if (shouldShowFallback) {
    return (
      <div ref={ref} className={cn('relative', className)} style={style}>
        <div
          className={cn(
            sizeClass,
            roundedClass,
            'flex items-center justify-center bg-surface-2 text-secondary-token',
            BORDER_RING,
            'shadow-sm transition-colors duration-200'
          )}
          role='img'
          aria-label={alt}
          aria-busy='false'
        >
          <span
            className={cn('font-medium leading-none select-none', textSize)}
          >
            {initials}
          </span>
        </div>
        {verified && (
          <span className='absolute -bottom-0.5 -right-0.5'>
            <VerifiedBadge size={badgeSize} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('relative', className)} style={style}>
      <div
        className={cn(
          sizeClass,
          roundedClass,
          'overflow-hidden bg-surface-1 text-primary-token',
          BORDER_RING,
          'shadow-sm transition-colors duration-200'
        )}
        role='img'
        aria-label={alt}
        aria-busy={!isLoaded}
      >
        <Image
          src={src}
          alt=''
          aria-hidden='true'
          width={width}
          height={height}
          priority={priority}
          quality={quality}
          placeholder='blur'
          blurDataURL={blurDataURL}
          sizes={`${width}px`}
          className={cn(
            'object-cover object-center transition-opacity duration-300 ease-out',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          style={{
            aspectRatio: '1 / 1',
          }}
        />

        {/* Loading shimmer effect */}
        {!isLoaded && !hasError && (
          <div className='absolute inset-0 skeleton' aria-hidden='true' />
        )}
      </div>

      {verified && (
        <span className='absolute -bottom-0.5 -right-0.5'>
          <VerifiedBadge size={badgeSize} />
        </span>
      )}
    </div>
  );
});

AvatarComponent.displayName = 'Avatar';

export const Avatar = React.memo(AvatarComponent);
