'use client';

import Image from 'next/image';
import React, { useMemo, useState } from 'react';
import { generateSEOAltText } from '@/lib/images/seo';
import { versionImageUrl } from '@/lib/images/versioning';
import { cn } from '@/lib/utils';
import { PlaceholderImage } from './PlaceholderImage';

interface OptimizedImageProps {
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'square' | 'rounded';
  className?: string;
  priority?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  quality?: number;
  aspectRatio?: 'square' | 'video' | 'portrait' | 'wide' | number;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  sizes?: string;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fallbackSrc?: string;
  unoptimized?: boolean;
  // SEO and accessibility
  artistName?: string;
  imageType?: 'avatar' | 'profile' | 'cover' | 'artwork' | 'icon';
  enableVersioning?: boolean;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  xl: 'h-24 w-24',
  '2xl': 'h-32 w-32',
};

const shapeClasses = {
  circle: 'rounded-full',
  square: 'rounded-none',
  rounded: 'rounded-lg',
};

const sizeDimensions = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
  '2xl': 128,
};

type ImageSize = keyof typeof sizeDimensions;

// Pre-generated blur placeholders for crisp loading states
const BLUR_PLACEHOLDERS = {
  square:
    'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  video:
    'data:image/webp;base64,UklGRnoCAABXRUJQVlA4WAoAAAAgAAAATwAAOQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAAKwAAAP8QEI0AAAAgHyAQg4CARGQ5iQ==',
  portrait:
    'data:image/webp;base64,UklGRnICAABXRUJQVlA4WAoAAAAgAAAAOQAATwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAAKwAAAP8QEI0AAAAgHyAQg4CARGQ5iXnORlY=',
  wide: 'data:image/webp;base64,UklGRnoCAABXRUJQVlA4WAoAAAAgAAAAfwAAOQAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAExADZWUDhUAAAAKwAAAP8QEI0AAAAgHyAQg4CARGQ5iXnORlYjFxAQ',
};

// Utility functions for enhanced image handling
function getAspectRatioValue(
  aspectRatio: OptimizedImageProps['aspectRatio']
): number | undefined {
  if (typeof aspectRatio === 'number') return aspectRatio;

  switch (aspectRatio) {
    case 'square':
      return 1;
    case 'video':
      return 16 / 9;
    case 'portrait':
      return 4 / 5;
    case 'wide':
      return 21 / 9;
    default:
      return undefined;
  }
}

function getBlurPlaceholder(
  aspectRatio: OptimizedImageProps['aspectRatio']
): string {
  if (typeof aspectRatio === 'number') return BLUR_PLACEHOLDERS.square;
  return (
    BLUR_PLACEHOLDERS[aspectRatio as keyof typeof BLUR_PLACEHOLDERS] ||
    BLUR_PLACEHOLDERS.square
  );
}

function generateAltText(
  src: string,
  fallback: string,
  artistName?: string,
  imageType?: string
): string {
  return generateSEOAltText(src, {
    artistName,
    type: imageType as 'avatar' | 'profile' | 'cover' | 'artwork' | 'icon',
    fallback,
  });
}

function getSizeDimension(size: ImageSize): number {
  return sizeDimensions[size];
}

function getDefaultSizes({
  sizes,
  fill,
  size,
}: {
  sizes?: string;
  fill: boolean;
  size: ImageSize;
}): string {
  if (sizes) return sizes;
  if (fill) {
    return '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';
  }
  const dimension = getSizeDimension(size);
  return `(max-width: 640px) ${dimension}px, ${dimension}px`;
}

function useOptimizedImageSource({
  src,
  fallbackSrc,
  hasError,
  enableVersioning,
}: {
  src?: string | null;
  fallbackSrc: string;
  hasError: boolean;
  enableVersioning: boolean;
}): string {
  return useMemo(() => {
    const baseSource = hasError || !src ? fallbackSrc : src;
    if (
      enableVersioning &&
      baseSource &&
      !baseSource.includes('/android-chrome-')
    ) {
      return versionImageUrl(baseSource);
    }
    return baseSource;
  }, [src, hasError, fallbackSrc, enableVersioning]);
}

function useOptimizedImageComputedValues({
  imageSrc,
  alt,
  artistName,
  imageType,
  aspectRatio,
  blurDataURL,
}: {
  imageSrc: string;
  alt: string;
  artistName?: string;
  imageType?: OptimizedImageProps['imageType'];
  aspectRatio?: OptimizedImageProps['aspectRatio'];
  blurDataURL?: string;
}) {
  return useMemo(() => {
    const computedAlt = generateAltText(
      imageSrc ?? '',
      alt,
      artistName,
      imageType
    );
    const aspectRatioValue = getAspectRatioValue(aspectRatio);
    const defaultBlur = blurDataURL || getBlurPlaceholder(aspectRatio);

    return { computedAlt, aspectRatioValue, defaultBlur };
  }, [imageSrc, alt, artistName, imageType, aspectRatio, blurDataURL]);
}

// Memoize the OptimizedImage component to prevent unnecessary re-renders
export const OptimizedImage = React.memo(function OptimizedImage({
  src,
  alt,
  size = 'md',
  shape = 'circle',
  className,
  priority = false,
  fill = false,
  width,
  height,
  quality = 85,
  aspectRatio,
  objectFit = 'cover',
  objectPosition = 'center',
  sizes,
  placeholder = 'blur',
  blurDataURL,
  fallbackSrc = '/avatars/default-user.png',
  unoptimized = false,
  artistName,
  imageType,
  enableVersioning = true,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Memoize the image source to prevent unnecessary re-renders
  const imageSrc = useOptimizedImageSource({
    src,
    fallbackSrc,
    hasError,
    enableVersioning,
  });

  // Memoize computed values to prevent unnecessary re-renders
  const { computedAlt, aspectRatioValue, defaultBlur } =
    useOptimizedImageComputedValues({
      imageSrc,
      alt,
      artistName,
      imageType,
      aspectRatio,
      blurDataURL,
    });

  // Memoize sizes and classes to prevent unnecessary re-renders - must be before conditional returns
  const { defaultSizes, containerClasses, imageProps } = useMemo(() => {
    const defaultSizes = getDefaultSizes({ sizes, fill, size });
    const containerClasses = cn(
      'relative overflow-hidden',
      !fill && sizeClasses[size],
      shapeClasses[shape],
      className
    );

    const imageProps = {
      src: imageSrc,
      alt: computedAlt,
      priority,
      quality,
      placeholder: placeholder as 'blur' | 'empty',
      ...(placeholder === 'blur' && { blurDataURL: defaultBlur }),
      ...(priority && { fetchPriority: 'high' as const }),
      className: cn(
        'transition-opacity duration-300',
        isLoading ? 'opacity-0' : 'opacity-100'
      ),
      onLoad: () => setIsLoading(false),
      onError: () => {
        setHasError(true);
        setIsLoading(false);
      },
      style: {
        objectFit,
        objectPosition,
        ...(aspectRatioValue && { aspectRatio: aspectRatioValue }),
      },
      unoptimized,
    };

    return { defaultSizes, containerClasses, imageProps };
  }, [
    sizes,
    fill,
    size,
    shape,
    className,
    imageSrc,
    computedAlt,
    priority,
    quality,
    placeholder,
    defaultBlur,
    isLoading,
    objectFit,
    objectPosition,
    aspectRatioValue,
    unoptimized,
  ]);

  // If no src or error occurred and no fallback, show placeholder
  if (!imageSrc) {
    return <PlaceholderImage size={size} shape={shape} className={className} />;
  }

  const dimension = getSizeDimension(size);

  return (
    <div className={containerClasses}>
      {fill ? (
        <Image {...imageProps} alt={computedAlt} fill sizes={defaultSizes} />
      ) : (
        <Image
          {...imageProps}
          alt={computedAlt}
          width={width || dimension}
          height={height || dimension}
          sizes={defaultSizes}
        />
      )}

      {/* Enhanced loading skeleton with shimmer */}
      {isLoading && (
        <div className='absolute inset-0 bg-linear-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-pulse motion-reduce:animate-none' />
      )}
    </div>
  );
});
