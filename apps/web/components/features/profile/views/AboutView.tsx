'use client';

import type { EntityMentionSegment } from '@/lib/profile/entity-mentions';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection, type AboutSelectedCredit } from '../AboutSection';

export type { AboutSelectedCredit } from '../AboutSection';

export interface AboutViewProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
  /** Entity-linked segments for the artist bio (computed server-side). */
  readonly bioSegments?: readonly EntityMentionSegment[];
  /** Linked collaborators for the Selected Credits row (JOV-6199 Wave 3). */
  readonly selectedCredits?: readonly AboutSelectedCredit[];
  /** Booking/contact rows for the About destination (JOV-6199 Wave 3). */
  readonly bookingContacts?: readonly PublicContact[];
}

/**
 * Body of the `about` mode: story, verified facts, selected credits,
 * booking/contact, and press assets. About is a consistent destination,
 * not overflow-only (JOV-6199 Wave 3).
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function AboutView({
  artist,
  genres,
  pressPhotos,
  allowPhotoDownloads,
  bioSegments,
  selectedCredits,
  bookingContacts,
}: AboutViewProps) {
  return (
    <AboutSection
      artist={artist}
      genres={genres}
      pressPhotos={pressPhotos}
      allowPhotoDownloads={allowPhotoDownloads}
      bioSegments={bioSegments}
      selectedCredits={selectedCredits}
      bookingContacts={bookingContacts}
    />
  );
}
