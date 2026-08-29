'use client';

// @coverage-via apps/web/tests/unit/components/atoms/Avatar/Avatar.test.tsx
import {
  type AvatarShape,
  type AvatarSize,
  Avatar as BaseAvatar,
  AvatarFallback as BaseAvatarFallback,
  getAvatarShapeClassName,
  getAvatarSizePx,
  getInitials,
} from '@jovie/ui';
import Image from 'next/image';
import React, { forwardRef, useMemo, useState } from 'react';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { cn } from '@/lib/utils';
import { shouldBypassImageOptimization } from '@/lib/utils/dsp-images';

export interface AvatarProps {
  /** Avatar image source URL */
  readonly src?: string | null;
  /** Alt text for the image */
  readonly alt: string;
  /** Display name for fallback initials */
  readonly name?: string;
  /** Avatar size — pixels come from the canonical @jovie/ui contract. */
  readonly size?: AvatarSize;
  /** Person/user avatars are circular; release artwork is rounded-square. */
  readonly shape?: AvatarShape;
  /** Whether this avatar represents a verified profile */
  readonly verified?: boolean;
  /** Loading priority for Next.js Image */
  readonly priority?: boolean;
  /** Image quality */
  readonly quality?: number;
  /** Responsive browser size hints for Next.js image selection */
  readonly sizes?: string;
  /** Custom className */
  readonly className?: string;
  /** Custom styling */
  readonly style?: React.ComponentPropsWithoutRef<'div'>['style'];
}

// Blur data URLs for different sizes for optimized loading
const BLUR_DATA_URLS = {
  24: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  32: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  48: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  64: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  80: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
  96: 'data:image/webp;base64,UklGRoQCAABXRUJQVlA4WAoAAAAgAAAAPwAAPwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAaSQBuAGMALgAgADIAMAAxADZWUDhUAAAALwAAAP8QEI0AAAAgHyAQg4CARGQ=',
} as const;

function generateInitials(name?: string): string {
  if (!name) return '?';
  return getInitials(name);
}

const AvatarComponent = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  {
    src,
    name,
    size = 'md',
    shape = 'person',
    verified = false,
    priority = false,
    quality = 85,
    sizes,
    className,
    style,
  },
  ref
) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const width = getAvatarSizePx(size);
  const shapeClassName = getAvatarShapeClassName(shape, width);
  const shouldUseBlurPlaceholder = width >= 40;
  const blurDataURL = useMemo(() => {
    if (BLUR_DATA_URLS[width as keyof typeof BLUR_DATA_URLS]) {
      return BLUR_DATA_URLS[width as keyof typeof BLUR_DATA_URLS];
    }
    // Fallback to the largest available blur placeholder
    return BLUR_DATA_URLS[96] || BLUR_DATA_URLS[48];
  }, [width]);
  const initials = generateInitials(name);
  const unoptimized = src ? shouldBypassImageOptimization(src) : false;
  const placeholderProps = shouldUseBlurPlaceholder
    ? ({ placeholder: 'blur', blurDataURL } as const)
    : ({ placeholder: 'empty' } as const);

  // Map avatar size to a sensible badge size
  const getBadgeSize = (): 'sm' | 'md' | 'lg' => {
    if (size === 'xs' || size === 'sm') return 'sm';
    if (size === 'md' || size === 'lg' || size === 'xl' || size === '2xl')
      return 'md';
    return 'lg';
  };
  const badgeSize = getBadgeSize();

  // Show fallback if no src or error occurred
  const shouldShowFallback = !src || hasError;

  if (shouldShowFallback) {
    return (
      <div ref={ref} className={cn('relative', className)} style={style}>
        <BaseAvatar
          size={size}
          shape={shape}
          data-slot='app-avatar'
          className='text-primary-token shadow-sm transition-colors duration-subtle'
          aria-hidden='true'
        >
          <BaseAvatarFallback
            size={size}
            shape={shape}
            className='font-medium leading-none select-none text-primary-token'
          >
            {initials}
          </BaseAvatarFallback>
        </BaseAvatar>
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
      <BaseAvatar
        size={size}
        shape={shape}
        data-slot='app-avatar'
        className={cn(
          'text-primary-token shadow-sm transition-colors duration-subtle',
          isLoaded && 'bg-surface-1'
        )}
        aria-hidden='true'
      >
        <Image
          src={src}
          alt=''
          aria-hidden='true'
          width={width}
          height={width}
          priority={priority}
          quality={quality}
          sizes={sizes ?? `${width}px`}
          unoptimized={unoptimized}
          {...placeholderProps}
          className={cn(
            'h-full w-full object-center transition-opacity duration-subtle ease-out',
            isLoaded ? 'opacity-100' : 'opacity-0',
            shape === 'artwork' ? 'object-contain' : 'object-cover',
            shapeClassName
          )}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          style={{
            aspectRatio: '1 / 1',
          }}
        />

        {/* Loading shimmer effect */}
        {!isLoaded && !hasError && (
          <div
            className={cn('absolute inset-0 skeleton', shapeClassName)}
            aria-hidden='true'
          />
        )}
      </BaseAvatar>

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
