'use client';

import Image from 'next/image';
import { ArtworkFallbackTile } from '@/components/atoms/ArtworkFallbackTile';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { cn } from '@/lib/utils';
import type { LibraryReleaseAsset } from './library-data';

export type LibraryThumbnailSize = 'card' | 'row' | 'drawer';

export interface LibraryMediaThumbnailProps {
  readonly asset: LibraryReleaseAsset;
  readonly size?: LibraryThumbnailSize;
  readonly className?: string;
}

function LibraryArtworkImage({
  asset,
  size,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly size: LibraryThumbnailSize;
}) {
  const sizeClasses = {
    card: 'h-full w-full',
    row: 'h-full w-full',
    drawer: 'h-full w-full',
  } satisfies Record<LibraryThumbnailSize, string>;

  if (asset.artworkUrl) {
    return (
      <Image
        src={asset.artworkUrl}
        alt=''
        width={size === 'row' ? 48 : 320}
        height={size === 'row' ? 48 : 320}
        className={cn(ARTWORK_FIT_CLASSNAME, sizeClasses[size])}
        loading={size === 'row' ? 'lazy' : 'eager'}
        unoptimized
      />
    );
  }

  return (
    <ArtworkFallbackTile
      seed={asset.title}
      size={
        size === 'row' ? 'thumbnail' : size === 'drawer' ? 'hero' : 'default'
      }
      iconClassName={size === 'row' ? 'h-4 w-4' : 'h-[36%] w-[36%]'}
    />
  );
}

export function LibraryMediaThumbnail({
  asset,
  size = 'card',
  className,
}: LibraryMediaThumbnailProps) {
  const artworkFrameSize =
    size === 'row' ? 'thumbnail' : size === 'drawer' ? 'hero' : 'default';

  return (
    <ArtworkFrame
      size={artworkFrameSize}
      className={cn(
        'system-b-library-media-thumbnail h-full w-full',
        className
      )}
      data-testid={`library-media-thumbnail-${asset.id}`}
      data-preview-mode='static'
    >
      <LibraryArtworkImage asset={asset} size={size} />
    </ArtworkFrame>
  );
}
