'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedAvatarProps {
  src: string | null | undefined;
  alt: string;
  size?: 64 | 128 | 256 | 384;
  className?: string;
  priority?: boolean;
  quality?: number;
  fallbackSrc?: string;
}

// Elegant blur placeholder data URIs for different sizes
const BLUR_DATA_URLS = {
  64: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  128: 'data:image/webp;base64,UklGRq4CAABXRUJQVlA4WAoAAAAgAAAAfwAAfwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhUAAAAMAAAAP8QEI0AAAAgHyAQg4CARGQ5iXnORlYAAAAgFxAQnYCARGQ=',
  256: 'data:image/webp;base64,UklGRroCAABXRUJQVlA4WAoAAAAgAAAA/wAA/wAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhUAAAAMgAAAP8QEI0AAAAgHyAQg4CARGQ5iXnORlYAAAAgFxAQnYCARGQ5iXmJRlY=',
  384: 'data:image/webp;base64,UklGRsICAABXRUJQVlA4WAoAAAAgAAAAfwEAfwEASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhUAAAANAAAAP8QEI0AAAAgHyAQg4CARGQ5iXnORlYAAAAgFxAQnYCARGQ5iXmJRlYjFxAQmQCARGQ=',
};

export function OptimizedAvatar({
  src,
  alt,
  size = 64,
  className,
  priority = false,
  quality = 85,
  fallbackSrc = '/android-chrome-192x192.png',
}: OptimizedAvatarProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const imageSrc = error || !src ? fallbackSrc : src;
  const aspectRatio = size / size; // Always square for avatars

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800',
        className
      )}
      style={{
        width: size,
        height: size,
      }}
    >
      <Image
        src={imageSrc}
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        quality={quality}
        placeholder='blur'
        blurDataURL={BLUR_DATA_URLS[size]}
        className={cn(
          'object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        sizes={`${size}px`}
        style={{
          aspectRatio,
          objectPosition: 'center',
        }}
      />

      {/* Loading shimmer effect */}
      {!loaded && !error && (
        <div className='absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700' />
      )}
    </div>
  );
}

// Responsive avatar that adapts to screen size
interface ResponsiveAvatarProps extends Omit<OptimizedAvatarProps, 'size'> {
  sizes?: string;
  mobileSize?: number;
  desktopSize?: number;
}

export function ResponsiveAvatar({
  src,
  alt,
  className,
  priority = false,
  quality = 85,
  fallbackSrc = '/android-chrome-192x192.png',
  sizes = '(max-width: 768px) 64px, 128px',
  desktopSize = 128,
}: ResponsiveAvatarProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const imageSrc = error || !src ? fallbackSrc : src;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800',
        'w-16 h-16 md:w-32 md:h-32', // Responsive sizing with Tailwind
        className
      )}
    >
      <Image
        src={imageSrc}
        alt={alt}
        fill
        priority={priority}
        quality={quality}
        placeholder='blur'
        blurDataURL={
          BLUR_DATA_URLS[desktopSize as keyof typeof BLUR_DATA_URLS] ||
          BLUR_DATA_URLS[256]
        }
        className={cn(
          'object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        sizes={sizes}
        style={{
          objectPosition: 'center',
        }}
      />

      {/* Loading shimmer effect */}
      {!loaded && !error && (
        <div className='absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700' />
      )}
    </div>
  );
}
