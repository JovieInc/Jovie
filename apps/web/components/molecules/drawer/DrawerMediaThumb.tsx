'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerMediaThumbProps {
  readonly src?: string | null;
  readonly alt: string;
  readonly fallback: ReactNode;
  readonly sizeClassName?: string;
  readonly sizes?: string;
  readonly className?: string;
  readonly imageClassName?: string;
}

export function DrawerMediaThumb({
  src,
  alt,
  fallback,
  sizeClassName = 'h-16 w-16',
  sizes = '64px',
  className,
  imageClassName,
}: DrawerMediaThumbProps) {
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) shadow-none',
        sizeClassName,
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className={cn('object-cover', imageClassName)}
          sizes={sizes}
        />
      ) : (
        <div className='flex h-full w-full items-center justify-center'>
          {fallback}
        </div>
      )}
    </div>
  );
}
