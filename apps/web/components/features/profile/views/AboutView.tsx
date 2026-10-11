'use client';

import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from '../AboutSection';

export interface AboutViewProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  /** Entity-linked segments for the artist bio (computed server-side). */
  readonly bioSegments?: readonly EntityMentionSegment[];
  /** Entity-linked selected-credits paragraph (computed server-side). */
  readonly creditSegments?: readonly EntityMentionSegment[];
  /** Public booking/contact entries shown on the About destination. */
  readonly contacts?: readonly PublicContact[];
}

/**
 * Body of the `about` mode: profile details, genres, and press assets.
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function AboutView({
  artist,
  genres,
  pressPhotos,
  allowPhotoDownloads,
  bioSegments,
  creditSegments,
  contacts,
}: AboutViewProps) {
  return (
    <AboutSection
      artist={artist}
      genres={genres}
      pressPhotos={pressPhotos}
      allowPhotoDownloads={allowPhotoDownloads}
      bioSegments={bioSegments}
      creditSegments={creditSegments}
      contacts={contacts}
    />
  );
}
