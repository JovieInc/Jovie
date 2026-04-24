'use client';

import { Calendar, Download, Home, MapPin } from 'lucide-react';
import Image from 'next/image';
import { hexToRgba, lightenHex } from '@/lib/utils/color';
import type { Artist } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';

interface AboutSectionProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
}

// Geist accent palette for genre badge rotation — tuned for dark surfaces
// via low-alpha fill + lightened text. Matches the design system's rotation.
const GENRE_ACCENTS = [
  '#8b5cf6', // purple
  '#22c1fc', // cyan
  '#0cce6b', // green
  '#f5a623', // amber
  '#0070f3', // blue
  '#ff0080', // pink
  '#00bcd4', // teal
  '#f7d600', // yellow
] as const;

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
      <div className='py-4 text-center'>
        <p className='text-[14px] font-book text-white/40'>
          No information available yet.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <p className='sr-only'>About {artist.name}</p>

      {hasBio && (
        <p className='text-[14px] font-book leading-relaxed text-white/70 whitespace-pre-line'>
          {artist.tagline}
        </p>
      )}

      {hasMetadata && (
        <div className='flex flex-wrap gap-x-5 gap-y-2'>
          {hasLocation && (
            <div className='flex items-center gap-2 text-[13px] text-white/50'>
              <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='capitalize'>{artist.location}</span>
            </div>
          )}
          {hasHometown && (
            <div className='flex items-center gap-2 text-[13px] text-white/50'>
              <Home className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='capitalize'>From {artist.hometown}</span>
            </div>
          )}
          {hasActiveSince && (
            <div className='flex items-center gap-2 text-[13px] text-white/50'>
              <Calendar className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span>Active since {artist.active_since_year}</span>
            </div>
          )}
        </div>
      )}

      {hasGenres && (
        <div className='flex flex-wrap gap-2'>
          {genres.map((genre, i) => {
            const accent = GENRE_ACCENTS[i % GENRE_ACCENTS.length];
            // Dedupe duplicate genre labels deterministically: track how
            // many times each label has appeared so the key is stable
            // across renders but still unique. Avoids array index in key.
            const dupIndex = genres.slice(0, i).filter(g => g === genre).length;
            const key = dupIndex === 0 ? genre : `${genre}-${dupIndex}`;
            return (
              <span
                key={key}
                className='rounded-full border px-3 py-1 text-[11px] font-[510] capitalize'
                style={{
                  backgroundColor: hexToRgba(accent, 0.14),
                  color: lightenHex(accent, 0.35),
                  borderColor: hexToRgba(accent, 0.28),
                }}
              >
                {genre}
              </span>
            );
          })}
        </div>
      )}

      {hasPressPhotos && (
        <div data-testid='profile-about-press-photos'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <h2 className='text-[13px] font-[510] text-white/70'>
              Press photos
            </h2>
          </div>

          <div className='grid gap-3 grid-cols-2'>
            {pressPhotos.map((photo, index) => (
              <div key={photo.id} className='overflow-hidden rounded-xl'>
                <div className='relative aspect-[4/5]'>
                  <Image
                    src={
                      photo.mediumUrl ?? photo.smallUrl ?? photo.blobUrl ?? ''
                    }
                    alt={
                      photo.originalFilename ??
                      `${artist.name} press photo ${index + 1}`
                    }
                    fill
                    sizes='(max-width: 640px) 50vw, 33vw'
                    className='object-cover'
                  />
                  {/* Download button — flat icon, circle on hover */}
                  <button
                    type='button'
                    disabled={!photo.blobUrl}
                    onClick={() => {
                      void downloadPressPhoto(photo, artist, index);
                    }}
                    className='absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors duration-normal hover:bg-black/40 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-50'
                    aria-label={
                      photo.originalFilename
                        ? `Download ${photo.originalFilename}`
                        : `Download press photo ${index + 1}`
                    }
                  >
                    <Download className='h-4 w-4' />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
