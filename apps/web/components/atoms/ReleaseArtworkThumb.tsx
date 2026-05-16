'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  getArtworkFallbackAccentStyle,
  getArtworkFallbackSurfaceStyle,
} from '@/lib/artwork-fallback';
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
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded bg-surface-2 shadow-sm',
        className
      )}
      style={{ width: size, height: size }}
    >
      {src && !imgError ? (
        <Image
          src={src}
          alt={alt}
          fill
          className='object-cover'
          sizes={`${size}px`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className='relative flex h-full w-full items-center justify-center overflow-hidden text-white/25'
          data-artwork-fallback='true'
          style={getArtworkFallbackSurfaceStyle(alt)}
        >
          <Icon
            name='Disc3'
            className={cn('relative z-10', fallbackIconClass)}
            aria-hidden='true'
          />
          <span
            aria-hidden='true'
            className='absolute inset-x-0 bottom-0 h-1'
            style={getArtworkFallbackAccentStyle(alt)}
          />
          <span
            aria-hidden='true'
            className='absolute inset-[1px] rounded-[3px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          />
          <span className='sr-only'>{alt}</span>
        </div>
      )}
    </div>
  );
}
