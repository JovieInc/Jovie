'use client';

import Image from 'next/image';
import { useState } from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { Icon } from '@/components/atoms/Icon';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/features/release/AlbumArtworkContextMenu';

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
 * Album artwork for smart link pages. The 224px square footprint is reserved
 * so profile and release pages do not shift; the frame uses the shared
 * scale-aware artwork radius and contain fit instead of avatar geometry.
 */
export function SmartLinkArtwork({
  src,
  alt,
  title = 'artwork',
  artworkSizes,
  allowDownloads = false,
}: SmartLinkArtworkProps) {
  const sizes = buildArtworkSizes(artworkSizes, src);
  const [imgError, setImgError] = useState(false);

  return (
    <div className='flex justify-center'>
      <AlbumArtworkContextMenu
        title={title}
        sizes={sizes}
        allowDownloads={allowDownloads}
      >
        <ArtworkFrame
          size={224}
          className='size-56 bg-white/5 shadow-2xl shadow-black/50 ring-1 ring-white/10'
        >
          {src && !imgError ? (
            <Image
              src={src}
              alt={alt}
              fill
              className={ARTWORK_FIT_CLASSNAME}
              sizes='224px'
              priority
              onError={() => setImgError(true)}
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
        </ArtworkFrame>
      </AlbumArtworkContextMenu>
    </div>
  );
}
