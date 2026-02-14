'use client';

import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/components/release/AlbumArtworkContextMenu';

interface SmartLinkArtworkProps {
  readonly src: string | null;
  readonly alt: string;
  /** Release title for download filenames */
  readonly title?: string;
  /** Pre-generated artwork sizes for download context menu */
  readonly artworkSizes?: Record<string, string> | null;
  /** Whether artwork downloads are allowed */
  readonly allowDownloads?: boolean;
}

/**
 * Album artwork for smart link pages, sized to match the profile avatar (224px / size-56).
 * This ensures visual consistency and eliminates layout shift between profile and release pages.
 * Includes right-click context menu for downloading artwork at multiple sizes.
 */
export function SmartLinkArtwork({
  src,
  alt,
  title = 'artwork',
  artworkSizes,
  allowDownloads = false,
}: SmartLinkArtworkProps) {
  const sizes = buildArtworkSizes(artworkSizes, src);

  return (
    <div className='flex justify-center'>
      <AlbumArtworkContextMenu
        title={title}
        sizes={sizes}
        allowDownloads={allowDownloads}
      >
        <div className='relative size-56 overflow-hidden rounded-lg bg-white/5 shadow-2xl shadow-black/50 ring-1 ring-white/10'>
          {src ? (
            <Image
              src={src}
              alt={alt}
              fill
              className='object-cover'
              sizes='224px'
              priority
            />
          ) : (
            <div className='flex h-full w-full items-center justify-center'>
              <Icon
                name='Disc3'
                className='h-16 w-16 text-white/20'
                aria-hidden='true'
              />
            </div>
          )}
        </div>
      </AlbumArtworkContextMenu>
    </div>
  );
}
