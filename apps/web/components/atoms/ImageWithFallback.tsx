'use client';

import type { ImageProps } from 'next/image';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fallback variant determines which placeholder icon is shown when an image fails to load.
 * - `release`: A disc/vinyl icon for album artwork
 * - `avatar`: A person silhouette for profile images
 * - `generic`: A simple image icon for everything else
 */
type FallbackVariant = 'release' | 'avatar' | 'generic';

interface ImageWithFallbackProps extends Omit<ImageProps, 'onError' | 'src'> {
  /** Image source — accepts null/undefined to show fallback gracefully */
  readonly src: ImageProps['src'] | null | undefined;
  /** Which fallback icon to show on error */
  readonly fallbackVariant?: FallbackVariant;
  /** Additional classes for the fallback container */
  readonly fallbackClassName?: string;
}

/** SVG disc icon for release artwork fallback */
function DiscIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <circle cx='12' cy='12' r='10' />
      <circle cx='12' cy='12' r='3' />
      <line x1='12' y1='2' x2='12' y2='5' />
      <line x1='12' y1='19' x2='12' y2='22' />
      <line x1='2' y1='12' x2='5' y2='12' />
      <line x1='19' y1='12' x2='22' y2='12' />
    </svg>
  );
}

/** SVG person silhouette for avatar fallback */
function PersonIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='currentColor'
      aria-hidden='true'
    >
      <path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' />
    </svg>
  );
}

/** SVG image icon for generic fallback */
function ImageIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <rect x='3' y='3' width='18' height='18' rx='2' ry='2' />
      <circle cx='8.5' cy='8.5' r='1.5' />
      <polyline points='21 15 16 10 5 21' />
    </svg>
  );
}

const FALLBACK_ICONS: Record<
  FallbackVariant,
  React.ComponentType<{ className?: string }>
> = {
  release: DiscIcon,
  avatar: PersonIcon,
  generic: ImageIcon,
};

/**
 * Drop-in replacement for Next.js `<Image>` that gracefully handles load failures.
 *
 * When the image source fails (404, CORS, expired CDN URL, etc.), instead of
 * rendering a broken image, it shows a styled placeholder with a contextual SVG icon.
 *
 * Usage:
 * ```tsx
 * <ImageWithFallback
 *   src={release.artworkUrl}
 *   alt="Album artwork"
 *   fill
 *   fallbackVariant="release"
 * />
 * ```
 */
export function ImageWithFallback({
  src,
  alt,
  fallbackVariant = 'generic',
  fallbackClassName,
  className,
  ...rest
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    const FallbackIcon = FALLBACK_ICONS[fallbackVariant];
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          fallbackClassName
        )}
        role='img'
        aria-label={alt}
      >
        <FallbackIcon className='h-1/3 w-1/3 text-tertiary-token' />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      {...rest}
    />
  );
}
