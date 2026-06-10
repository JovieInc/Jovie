'use client';

import { ArrowDownToLine, Disc3, FileText, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';

interface LibraryShareAssetCardProps {
  readonly asset: LibraryShareDropAsset;
  readonly downloadsEnabled: boolean;
  readonly layout: 'grid' | 'list' | 'reel';
}

function formatReleaseDate(value: string | null): string {
  if (!value) return 'No release date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No release date';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function LibraryShareAssetCard({
  asset,
  downloadsEnabled,
  layout,
}: LibraryShareAssetCardProps) {
  const isList = layout === 'list';
  const isReel = layout === 'reel';

  return (
    <article
      className={
        isList
          ? 'flex gap-4 rounded-2xl border border-subtle bg-surface-0 p-3'
          : isReel
            ? 'w-[min(78vw,280px)] shrink-0 snap-center overflow-hidden rounded-2xl border border-subtle bg-surface-0'
            : 'overflow-hidden rounded-2xl border border-subtle bg-surface-0'
      }
      data-testid={`library-share-asset-${asset.id}`}
    >
      <div
        className={
          isList
            ? 'relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-1'
            : isReel
              ? 'relative aspect-[9/16] w-full overflow-hidden bg-surface-1'
              : 'relative aspect-square w-full overflow-hidden bg-surface-1'
        }
      >
        {asset.includeArtwork && asset.artworkUrl ? (
          <Image
            src={asset.artworkUrl}
            alt={asset.title}
            fill
            sizes={isList ? '96px' : '(max-width: 768px) 100vw, 320px'}
            className='object-cover'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center text-tertiary-token'>
            <Disc3 className='h-8 w-8' strokeWidth={2} />
          </div>
        )}
      </div>

      <div className={isList ? 'min-w-0 flex-1 py-1' : 'space-y-3 p-4'}>
        <div>
          <p className='text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary-token'>
            {asset.releaseType}
          </p>
          <h2 className='mt-1 truncate text-base font-semibold text-primary-token'>
            {asset.title}
          </h2>
          <p className='mt-1 text-sm text-secondary-token'>
            {formatReleaseDate(asset.releaseDate)}
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Link
            href={asset.smartLinkPath}
            className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-xs font-medium text-primary-token transition-colors hover:bg-surface-1'
          >
            <PlayCircle className='h-3.5 w-3.5' strokeWidth={2.25} />
            Open smart link
          </Link>
          {asset.includePreview && asset.previewUrl && downloadsEnabled ? (
            <a
              href={asset.previewUrl}
              download
              className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-xs font-medium text-primary-token transition-colors hover:bg-surface-1'
            >
              <ArrowDownToLine className='h-3.5 w-3.5' strokeWidth={2.25} />
              Download preview
            </a>
          ) : null}
          {asset.includeLyrics && asset.lyrics ? (
            <span className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-xs text-secondary-token'>
              <FileText className='h-3.5 w-3.5' strokeWidth={2.25} />
              Lyrics included
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
