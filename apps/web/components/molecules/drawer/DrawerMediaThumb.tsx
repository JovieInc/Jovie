'use client';

import Image from 'next/image';
import { type ReactEventHandler, type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerMediaThumbProps {
  readonly src?: string | null;
  readonly alt: string;
  readonly fallback: ReactNode;
  /** Intrinsic image dimensions; keeps Next Image stable while the drawer is collapsed. */
  readonly dimension?: number;
  readonly sizeClassName?: string;
  readonly sizes?: string;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly priority?: boolean;
  readonly onImageError?: ReactEventHandler<HTMLImageElement>;
}

export function DrawerMediaThumb({
  src,
  alt,
  fallback,
  dimension = 64,
  sizeClassName = 'h-16 w-16',
  sizes = '64px',
  className,
  imageClassName,
  onImageError,
  priority = false,
}: DrawerMediaThumbProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src && src !== failedSrc ? src : null;

  return (
    <div
      role='img'
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg bg-surface-1 outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10',
        sizeClassName,
        className
      )}
    >
      {resolvedSrc ? (
        <Image
          src={resolvedSrc}
          alt=''
          aria-hidden='true'
          priority={priority}
          width={dimension}
          height={dimension}
          className={cn('h-full w-full object-cover', imageClassName)}
          sizes={sizes}
          onError={event => {
            setFailedSrc(src ?? null);
            onImageError?.(event);
          }}
        />
      ) : (
        <div className='flex h-full w-full items-center justify-center'>
          {fallback}
        </div>
      )}
    </div>
  );
}
