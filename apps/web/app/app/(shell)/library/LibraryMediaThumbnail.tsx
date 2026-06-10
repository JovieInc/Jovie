'use client';

import Image from 'next/image';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useState,
} from 'react';
import { ArtworkFallbackTile } from '@/components/atoms/ArtworkFallbackTile';
import { cn } from '@/lib/utils';
import { LibraryAudioWaveformThumbnail } from './LibraryAudioWaveformThumbnail';
import { LibraryVideoScrubThumbnail } from './LibraryVideoScrubThumbnail';
import type { LibraryReleaseAsset } from './library-data';
import { scrubRatioFromPointer } from './library-thumbnail-utils';

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
    row: 'h-10 w-10',
    drawer: 'h-full w-full',
  } satisfies Record<LibraryThumbnailSize, string>;

  if (asset.artworkUrl) {
    return (
      <Image
        src={asset.artworkUrl}
        alt=''
        width={size === 'row' ? 48 : 320}
        height={size === 'row' ? 48 : 320}
        className={cn('object-cover', sizeClasses[size])}
        loading={size === 'row' ? 'lazy' : 'eager'}
        unoptimized
      />
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden border border-subtle bg-surface-1',
        sizeClasses[size]
      )}
    >
      <ArtworkFallbackTile
        seed={asset.title}
        iconClassName={size === 'row' ? 'h-4 w-4' : 'h-[36%] w-[36%]'}
      />
    </div>
  );
}

export function LibraryMediaThumbnail({
  asset,
  size = 'card',
  className,
}: LibraryMediaThumbnailProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [scrubRatio, setScrubRatio] = useState(0);
  const compact = size === 'row';
  const showVideoScrub = Boolean(asset.videoUrl);
  const showAudioScrub = Boolean(asset.previewUrl) && !showVideoScrub;
  const hasScrubPreview = showVideoScrub || showAudioScrub;

  const updateScrub = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setScrubRatio(scrubRatioFromPointer(event.clientX, rect));
  }, []);

  return (
    <div
      className={cn(
        'system-b-library-media-thumbnail relative h-full w-full overflow-hidden',
        className
      )}
      data-testid={`library-media-thumbnail-${asset.id}`}
      data-preview-mode={
        showVideoScrub ? 'video' : showAudioScrub ? 'audio' : 'static'
      }
    >
      <LibraryArtworkImage asset={asset} size={size} />
      {hasScrubPreview ? (
        <div
          role='slider'
          aria-label={`Scrub preview for ${asset.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scrubRatio * 100)}
          tabIndex={-1}
          data-testid={`library-media-scrub-surface-${asset.id}`}
          className='absolute inset-0 z-[1]'
          onMouseEnter={event => {
            setIsHovering(true);
            updateScrub(event);
          }}
          onMouseMove={event => {
            setIsHovering(true);
            updateScrub(event);
          }}
          onMouseLeave={() => {
            setIsHovering(false);
            setScrubRatio(0);
          }}
        />
      ) : null}
      {showVideoScrub && asset.videoUrl ? (
        <LibraryVideoScrubThumbnail
          title={asset.title}
          videoUrl={asset.videoUrl}
          posterUrl={asset.artworkUrl}
          durationMs={asset.totalDurationMs}
          scrubRatio={scrubRatio}
          isActive={isHovering}
          compact={compact}
        />
      ) : null}
      {showAudioScrub ? (
        <LibraryAudioWaveformThumbnail
          title={asset.title}
          waveformSeed={asset.waveformSeed}
          durationMs={asset.totalDurationMs}
          scrubRatio={scrubRatio}
          isActive={isHovering}
          compact={compact}
        />
      ) : null}
    </div>
  );
}
