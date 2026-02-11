'use client';

/**
 * ReleaseArtwork Component
 *
 * Artwork section showing release's album cover and basic info.
 * Supports drag-and-drop upload and right-click context menu for downloads.
 */

import { Disc3 } from 'lucide-react';
import Image from 'next/image';

import { TruncatedText } from '@/components/atoms/TruncatedText';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/components/release/AlbumArtworkContextMenu';

interface ReleaseArtworkProps {
  readonly artworkUrl: string | null | undefined;
  readonly title: string;
  readonly artistName?: string | null;
  readonly canUploadArtwork: boolean;
  readonly onArtworkUpload?: (file: File) => Promise<string>;
  /** Artwork sizes map from release metadata for context menu downloads */
  readonly artworkSizes?: Record<string, string> | null;
  /** Whether artwork downloads are allowed (context menu) */
  readonly allowDownloads?: boolean;
  /** Release ID for analytics */
  readonly releaseId?: string;
  /** Whether the artwork can be reverted to the original DSP-ingested version */
  readonly canRevert?: boolean;
  /** Callback to revert artwork to original */
  readonly onRevert?: () => void;
}

export function ReleaseArtwork({
  artworkUrl,
  title,
  artistName,
  canUploadArtwork,
  onArtworkUpload,
  artworkSizes,
  allowDownloads = false,
  releaseId,
  canRevert = false,
  onRevert,
}: ReleaseArtworkProps) {
  const altText = title ? `${title} artwork` : 'Release artwork';
  const sizes = buildArtworkSizes(artworkSizes, artworkUrl);

  const artworkImage = (
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
          <Disc3 className='h-8 w-8 text-tertiary-token' aria-hidden='true' />
        </div>
      )}
    </div>
  );

  return (
    <div className='flex items-center gap-3' data-testid='release-artwork'>
      {canUploadArtwork && onArtworkUpload ? (
        <AlbumArtworkContextMenu
          title={title}
          sizes={sizes}
          allowDownloads={allowDownloads}
          releaseId={releaseId}
          canRevert={canRevert}
          onRevert={onRevert}
        >
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
        </AlbumArtworkContextMenu>
      ) : (
        <AlbumArtworkContextMenu
          title={title}
          sizes={sizes}
          allowDownloads={allowDownloads}
          releaseId={releaseId}
          canRevert={canRevert}
          onRevert={onRevert}
        >
          {artworkImage}
        </AlbumArtworkContextMenu>
      )}
      <div className='min-w-0 flex-1'>
        <TruncatedText
          lines={1}
          className='text-sm font-medium text-primary-token'
        >
          {title || 'Untitled'}
        </TruncatedText>
        {artistName && (
          <TruncatedText lines={1} className='text-xs text-tertiary-token'>
            {artistName}
          </TruncatedText>
        )}
      </div>
    </div>
  );
}
