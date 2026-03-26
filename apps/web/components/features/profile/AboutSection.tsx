'use client';

import { Calendar, Download, Home, MapPin } from 'lucide-react';
import Image from 'next/image';
import type { Artist } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

interface AboutSectionProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
}

function sanitizeFilename(value: string): string {
  const sanitized = value
    .replaceAll(/[^a-zA-Z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
  return sanitized || 'press-photo';
}

async function downloadPressPhoto(
  photo: PressPhoto,
  artist: Artist,
  index: number
): Promise<void> {
  if (!photo.blobUrl) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(photo.blobUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilename(artist.handle ?? artist.name)}-press-${index + 1}.avif`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    globalThis.open(photo.blobUrl, '_blank', 'noopener,noreferrer');
  }
}

export function AboutSection({
  artist,
  genres,
  pressPhotos = [],
  allowPhotoDownloads = false,
}: AboutSectionProps) {
  const hasBio = Boolean(artist.tagline);
  const hasLocation = Boolean(artist.location);
  const hasHometown = Boolean(artist.hometown);
  const hasActiveSince = Boolean(artist.active_since_year);
  const hasGenres = genres && genres.length > 0;
  const hasPressPhotos = allowPhotoDownloads && pressPhotos.length > 0;
  const hasMetadata = hasLocation || hasHometown || hasActiveSince;

  const hasContent = hasBio || hasMetadata || hasGenres || hasPressPhotos;

  if (!hasContent) {
    return (
      <main
        id='main-content'
        className='rounded-2xl border border-subtle bg-surface-1 shadow-sm p-8 text-center'
      >
        <p className='text-sm text-tertiary-token'>
          No information available yet.
        </p>
      </main>
    );
  }

  return (
    <main id='main-content' className='space-y-4' aria-labelledby='about-title'>
      <h1 id='about-title' className='sr-only'>
        About {artist.name}
      </h1>

      <div className='rounded-2xl border border-subtle bg-surface-1 shadow-sm overflow-hidden'>
        {hasBio && (
          <div className='px-6 pt-6 pb-5'>
            <p className='text-base leading-relaxed text-secondary-token whitespace-pre-line'>
              {artist.tagline}
            </p>
          </div>
        )}

        {hasMetadata && (
          <div
            className={`flex flex-wrap gap-x-5 gap-y-2 px-6 pb-5 ${hasBio ? 'border-t border-subtle pt-5' : 'pt-6'}`}
          >
            {hasLocation && (
              <div className='flex items-center gap-2 text-sm text-tertiary-token'>
                <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span className='capitalize'>{artist.location}</span>
              </div>
            )}
            {hasHometown && (
              <div className='flex items-center gap-2 text-sm text-tertiary-token'>
                <Home className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span className='capitalize'>From {artist.hometown}</span>
              </div>
            )}
            {hasActiveSince && (
              <div className='flex items-center gap-2 text-sm text-tertiary-token'>
                <Calendar className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span>Active since {artist.active_since_year}</span>
              </div>
            )}
          </div>
        )}

        {hasGenres && (
          <div
            className={`px-6 pb-6 ${hasBio || hasMetadata ? 'border-t border-subtle pt-5' : 'pt-6'}`}
          >
            <div className='flex flex-wrap gap-2'>
              {genres.map(genre => (
                <span
                  key={genre}
                  className='rounded-full bg-surface-2 px-3 py-1 text-xs font-medium capitalize text-secondary-token'
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasPressPhotos && (
          <div
            className={`px-6 pb-6 ${hasBio || hasMetadata || hasGenres ? 'border-t border-subtle pt-5' : 'pt-6'}`}
          >
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h2 className='text-sm font-medium text-primary-token'>
                Press Photos
              </h2>
              <span className='text-xs text-tertiary-token'>
                Download originals
              </span>
            </div>

            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {pressPhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className='overflow-hidden rounded-[20px] border border-subtle bg-surface-0'
                >
                  <div className='relative aspect-[4/5] bg-surface-2'>
                    <Image
                      src={
                        photo.mediumUrl ?? photo.smallUrl ?? photo.blobUrl ?? ''
                      }
                      alt={
                        photo.originalFilename ??
                        `${artist.name} press photo ${index + 1}`
                      }
                      fill
                      sizes='(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
                      className='object-cover'
                    />
                  </div>
                  <div className='flex items-center justify-between gap-3 px-4 py-3'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium text-primary-token'>
                        {photo.originalFilename ?? `Press photo ${index + 1}`}
                      </p>
                      {(photo.width || photo.height) && (
                        <p className='text-xs text-tertiary-token'>
                          {photo.width ?? '?'} x {photo.height ?? '?'}
                        </p>
                      )}
                    </div>
                    <button
                      type='button'
                      disabled={!photo.blobUrl}
                      onClick={() => {
                        void downloadPressPhoto(photo, artist, index);
                      }}
                      className='inline-flex items-center gap-1.5 rounded-full border border-subtle px-3 py-1.5 text-xs font-medium text-secondary-token transition-colors hover:border-default hover:text-primary-token disabled:cursor-not-allowed disabled:opacity-50'
                    >
                      <Download className='h-3.5 w-3.5' />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
