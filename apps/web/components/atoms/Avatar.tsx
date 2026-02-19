'use client';

import Image from 'next/image';
import React, { forwardRef } from 'react';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  readonly src?: string | null;
  readonly alt: string;
  readonly initials: string;
  readonly sizeClass: string;
  readonly textSize: string;
  readonly roundedClass: string;
  readonly badgeSize: 'sm' | 'md' | 'lg';
  readonly verified?: boolean;
  readonly className?: string;
  readonly style?: React.ComponentPropsWithoutRef<'div'>['style'];
  readonly width: number;
  readonly height: number;
  readonly isLoaded?: boolean;
  readonly showFallback?: boolean;
  readonly priority?: boolean;
  readonly quality?: number;
  readonly blurDataURL?: string;
  readonly onLoad?: () => void;
  readonly onError?: () => void;
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  {
    src,
    alt,
    initials,
    sizeClass,
    textSize,
    roundedClass,
    badgeSize,
    verified = false,
    className,
    style,
    width,
    height,
    isLoaded = false,
    showFallback = false,
    priority = false,
    quality = 85,
    blurDataURL,
    onLoad,
    onError,
  },
  ref
) {
  if (showFallback || !src) {
    return (
      <div ref={ref} className={cn('relative', className)} style={style}>
        <div
          className={cn(
            sizeClass,
            roundedClass,
            'flex items-center justify-center bg-surface-2 text-secondary-token shadow-sm transition-colors duration-200'
          )}
          aria-hidden='true'
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
          'overflow-hidden text-primary-token shadow-sm transition-colors duration-200',
          isLoaded && 'bg-surface-1'
        )}
        aria-hidden='true'
      >
        <Image
          src={src}
          alt=''
          aria-hidden='true'
          width={width}
          height={height}
          {...(priority ? { priority: true } : {})}
          quality={quality}
          placeholder={blurDataURL ? 'blur' : 'empty'}
          {...(blurDataURL ? { blurDataURL } : {})}
          sizes={`${width}px`}
          className={cn(
            'object-cover object-center transition-opacity duration-300 ease-out',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={onLoad}
          onError={onError}
          style={{ aspectRatio: '1 / 1' }}
        />

        {!isLoaded && (
          <div
            className={cn('absolute inset-0 skeleton', roundedClass)}
            aria-hidden='true'
          />
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

Avatar.displayName = 'Avatar';
