'use client';

import Image from 'next/image';
import { ArtworkFallbackTile } from '@/components/atoms/ArtworkFallbackTile';
import { ArtworkFrame } from '@/components/atoms/ArtworkFrame';
import { cn } from '@/lib/utils';

interface ReleaseArtworkThumbProps {
  readonly src: string | null | undefined;
  readonly alt: string;
  /** Pixel size (used for both width/height and Next.js sizes hint) */
  readonly size?: number;
  /** Additional classes on the outer container */
  readonly className?: string;
  /** Icon size class for the fallback Disc3 icon */
  readonly fallbackIconClass?: string;
}

/**
 * Square artwork thumbnail with rounded corners.
 * Shows a Disc3 fallback icon when:
 * - No src is provided
 * - The image fails to load (404, CORS, expired CDN URL, etc.)
 */
export function ReleaseArtworkThumb({
  src,
  alt,
  size = 40,
  className,
  fallbackIconClass = 'h-5 w-5',
}: ReleaseArtworkThumbProps) {
  const fallback = (
    <ArtworkFallbackTile
      seed={alt}
      label={alt}
      iconClassName={fallbackIconClass}
    />
  );

  return (
    <ArtworkFrame
      size={size}
      className={cn('bg-surface-2', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <>
          <Image
            key={src}
            src={src}
            alt={alt}
            fill
            className='object-cover'
            sizes={`${size}px`}
            onError={event => {
              event.currentTarget.style.display = 'none';
              const sibling = event.currentTarget.nextElementSibling;
              if (sibling instanceof HTMLElement) {
                sibling.hidden = false;
              }
            }}
          />
          <div className='absolute inset-0' hidden>
            {fallback}
          </div>
        </>
      ) : (
        fallback
      )}
    </ArtworkFrame>
  );
}
