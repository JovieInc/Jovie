'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
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
 * Square artwork thumbnail with rounded-lg corners.
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
        'relative shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm',
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
        <div className='flex h-full w-full items-center justify-center'>
          <Icon
            name='Disc3'
            className={cn('text-tertiary-token', fallbackIconClass)}
            aria-hidden='true'
          />
        </div>
      )}
    </div>
  );
}
