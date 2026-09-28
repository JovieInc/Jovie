'use client';

import { Calendar, Download, Home, MapPin } from 'lucide-react';
import Link from 'next/link';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { formatPublicContactSubtitle } from '@/lib/contacts/format-public-contact';
import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { EntityMentionText } from './EntityMentionText';

interface AboutSectionProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  /**
   * Optional entity-linked segments for `artist.tagline` (computed
   * server-side). Falls back to plain text when omitted.
   */
  readonly bioSegments?: readonly EntityMentionSegment[];
  /**
   * Selected-credits paragraph as entity-linked segments (computed
   * server-side from structured release-credit edges). Omitted when the
   * profile has no verified credits.
   */
  readonly creditSegments?: readonly EntityMentionSegment[];
  /**
   * Public booking/contact entries. Rendered as a link list into the
   * Contact view; omitted entirely when the profile has none.
   */
  readonly contacts?: readonly PublicContact[];
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
  bioSegments,
  creditSegments,
  contacts = [],
}: AboutSectionProps) {
  const hasBio = Boolean(artist.tagline);
  const hasLocation = Boolean(artist.location);
  const hasHometown = Boolean(artist.hometown);
  const hasActiveSince = Boolean(artist.active_since_year);
  const uniqueGenres = genres
    ? Array.from(new Set(genres.map(genre => genre.trim()).filter(Boolean)))
    : [];
  const hasGenres = uniqueGenres.length > 0;
  const hasPressPhotos = allowPhotoDownloads && pressPhotos.length > 0;
  const hasMetadata = hasLocation || hasHometown || hasActiveSince;
  const hasCredits = Boolean(creditSegments && creditSegments.length > 0);
  const contactableContacts = contacts.filter(
    contact => contact.channels.length > 0
  );
  const hasContacts = contactableContacts.length > 0;
  const contactHref = `/${encodeURIComponent(artist.handle)}?mode=contact`;

  const hasContent =
    hasBio ||
    hasMetadata ||
    hasGenres ||
    hasPressPhotos ||
    hasCredits ||
    hasContacts;

  if (!hasContent) {
    return (
      <div className='py-4 text-center'>
        <p className='text-sm font-book text-white/40'>
          No information available yet.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-5'>
      <p className='sr-only'>About {artist.name}</p>

      {hasBio && (
        <p className='text-sm font-book leading-relaxed text-white/70 whitespace-pre-line'>
          {bioSegments ? (
            <EntityMentionText segments={bioSegments} />
          ) : (
            artist.tagline
          )}
        </p>
      )}

      {hasMetadata && (
        <div className='flex flex-wrap gap-x-5 gap-y-2'>
          {hasLocation && (
            <div className='flex items-center gap-2 text-app text-white/50'>
              <MapPin className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='capitalize'>{artist.location}</span>
            </div>
          )}
          {hasHometown && (
            <div className='flex items-center gap-2 text-app text-white/50'>
              <Home className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span className='capitalize'>From {artist.hometown}</span>
            </div>
          )}
          {hasActiveSince && (
            <div className='flex items-center gap-2 text-app text-white/50'>
              <Calendar className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
              <span>Active since {artist.active_since_year}</span>
            </div>
          )}
        </div>
      )}

      {hasGenres && (
        <div className='flex flex-wrap gap-2'>
          {uniqueGenres.map(genre => {
            return (
              <span
                key={genre}
                className='rounded-full border border-(--profile-status-pill-border) bg-(--profile-status-pill-bg) px-3 py-1 text-2xs font-caption capitalize text-(--profile-status-pill-fg)'
              >
                {genre}
              </span>
            );
          })}
        </div>
      )}

      {hasCredits && (
        <div data-testid='profile-about-credits'>
          <h2 className='mb-2 text-app font-caption text-white/70'>
            Selected Credits
          </h2>
          <p className='text-sm font-book leading-relaxed text-white/70'>
            <EntityMentionText segments={creditSegments ?? []} />
          </p>
        </div>
      )}

      {hasContacts && (
        <div data-testid='profile-about-contacts'>
          <h2 className='mb-2 text-app font-caption text-white/70'>
            Booking &amp; Contact
          </h2>
          <ul className='flex flex-col gap-1'>
            {contactableContacts.map(contact => {
              const subtitle = formatPublicContactSubtitle(contact);
              return (
                <li key={contact.id}>
                  <Link
                    href={contactHref}
                    prefetch={false}
                    className='group inline-flex min-h-11 max-w-full flex-col items-start justify-center gap-0.5 text-left'
                  >
                    <span className='text-sm font-semibold text-white/80 underline-offset-4 group-hover:underline'>
                      {contact.roleLabel}
                    </span>
                    {subtitle ? (
                      <span className='text-xs text-white/50'>{subtitle}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasPressPhotos && (
        <div data-testid='profile-about-press-photos'>
          <div className='mb-3 flex items-center justify-between gap-3'>
            <h2 className='text-app font-caption text-white/70'>
              Press Photos
            </h2>
          </div>

          <div className='grid gap-3 grid-cols-2'>
            {pressPhotos.map((photo, index) => (
              <div key={photo.id} className='overflow-hidden rounded-xl'>
                <div className='relative aspect-[4/5]'>
                  <ImageWithFallback
                    src={photo.mediumUrl ?? photo.smallUrl ?? photo.blobUrl}
                    alt={
                      photo.originalFilename ??
                      `${artist.name} press photo ${index + 1}`
                    }
                    fill
                    sizes='(max-width: 640px) 50vw, 33vw'
                    loading={index < 2 ? 'eager' : 'lazy'}
                    className='object-cover'
                    fallbackVariant='avatar'
                    fallbackClassName='bg-surface-2'
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
