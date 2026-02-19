'use client';

import { Disc3 } from 'lucide-react';
import Image from 'next/image';

import { EntityHeaderCard } from '@/components/molecules/drawer';
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

  const staticImage = (
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

  const artworkImage =
    canUploadArtwork && onArtworkUpload ? (
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
        {staticImage}
      </AlbumArtworkContextMenu>
    );

  return (
    <EntityHeaderCard
      image={artworkImage}
      title={title || 'Untitled'}
      subtitle={artistName}
      data-testid='release-artwork'
    />
  );
}
