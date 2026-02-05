'use client';

import Image from 'next/image';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { generateSEOAltText } from '@/lib/images/seo';
import { versionImageUrl } from '@/lib/images/versioning';
import { cn } from '@/lib/utils';
import { PlaceholderImage } from '@/components/atoms/PlaceholderImage';

interface OptimizedImageProps {
  readonly src?: string | null;
  readonly alt: string;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  readonly shape?: 'circle' | 'square' | 'rounded';
  readonly className?: string;
  readonly priority?: boolean;
  readonly fill?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly aspectRatio?: 'square' | 'video' | 'portrait' | 'wide' | number;
  readonly objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  readonly objectPosition?: string;
  readonly sizes?: string;
  readonly placeholder?: 'blur' | 'empty';
  readonly blurDataURL?: string;
  readonly fallbackSrc?: string;
  readonly unoptimized?: boolean;
  // SEO and accessibility
  readonly artistName?: string;
  readonly imageType?: 'avatar' | 'profile' | 'cover' | 'artwork' | 'icon';
  readonly enableVersioning?: boolean;
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

type WindowWithImageRenderCounts = Window & {
  __jovieImageRenderCounts?: Record<string, number>;
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
}: Readonly<OptimizedImageProps>) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const renderCount = useRef(0);

  renderCount.current += 1;

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

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  // Memoize sizes and classes to prevent unnecessary re-renders - must be before conditional returns
  const { defaultSizes, containerClasses } = useMemo(() => {
    const defaultSizes = getDefaultSizes({ sizes, fill, size });
    const containerClasses = cn(
      'relative overflow-hidden',
      !fill && sizeClasses[size],
      shapeClasses[shape],
      className
    );

    return { defaultSizes, containerClasses };
  }, [sizes, fill, size, shape, className]);

  const stableImageProps = useMemo(() => {
    return {
      src: imageSrc,
      alt: computedAlt,
      priority,
      quality,
      placeholder,
      ...(placeholder === 'blur' && { blurDataURL: defaultBlur }),
      ...(priority && { fetchPriority: 'high' as const }),
      style: {
        objectFit,
        objectPosition,
        ...(aspectRatioValue && { aspectRatio: aspectRatioValue }),
      },
      unoptimized,
    };
  }, [
    imageSrc,
    computedAlt,
    priority,
    quality,
    placeholder,
    defaultBlur,
    objectFit,
    objectPosition,
    aspectRatioValue,
    unoptimized,
  ]);

  const loadingImageProps = useMemo(() => {
    return {
      className: cn(
        'transition-opacity duration-300',
        isLoading ? 'opacity-0' : 'opacity-100'
      ),
      onLoad: handleLoad,
      onError: handleError,
    };
  }, [handleError, handleLoad, isLoading]);

  const imageProps = useMemo(
    () => ({ ...stableImageProps, ...loadingImageProps }),
    [loadingImageProps, stableImageProps]
  );

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.NEXT_PUBLIC_IMAGE_RENDER_DEBUG === 'true'
    ) {
      const renderKey = imageSrc || computedAlt;
      if (typeof window !== 'undefined') {
        const typedWindow = window as WindowWithImageRenderCounts;
        typedWindow.__jovieImageRenderCounts ??= {};
        typedWindow.__jovieImageRenderCounts[renderKey] = renderCount.current;
      }
    }
  }, [computedAlt, imageSrc]);

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
