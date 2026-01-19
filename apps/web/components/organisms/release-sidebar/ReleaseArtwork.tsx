'use client';

/**
 * ReleaseArtwork Component
 *
 * Artwork section showing release's album cover and basic info
 */

import { Disc3 } from 'lucide-react';
import Image from 'next/image';

import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';

interface ReleaseArtworkProps {
  artworkUrl: string | null | undefined;
  title: string;
  artistName?: string | null;
  canUploadArtwork: boolean;
  onArtworkUpload?: (file: File) => Promise<string>;
}

export function ReleaseArtwork({
  artworkUrl,
  title,
  artistName,
  canUploadArtwork,
  onArtworkUpload,
}: ReleaseArtworkProps) {
  const altText = title ? `${title} artwork` : 'Release artwork';

  return (
    <div className='flex items-center gap-3' data-testid='release-artwork'>
      {canUploadArtwork && onArtworkUpload ? (
        <AvatarUploadable
          src={artworkUrl}
          alt={altText}
          name={title}
          size='lg'
          uploadable={canUploadArtwork}
          onUpload={onArtworkUpload}
          showHoverOverlay
          className='rounded-lg'
        />
      ) : (
        <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm'>
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt={altText}
              fill
              className='object-cover'
              sizes='64px'
            />
          ) : (
            <div className='flex h-full w-full items-center justify-center'>
              <Disc3
                className='h-8 w-8 text-tertiary-token'
                aria-hidden='true'
              />
            </div>
          )}
        </div>
      )}
      <div className='min-w-0 flex-1'>
        <div className='text-sm font-medium truncate'>{title}</div>
        {artistName && (
          <div className='text-xs text-sidebar-muted truncate'>
            {artistName}
          </div>
        )}
      </div>
    </div>
  );
}
