'use client';

import type { Artist } from '@/types/db';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from '../AboutSection';

export interface AboutViewProps {
  readonly artist: Artist;
  readonly genres?: string[] | null;
  readonly pressPhotos?: PressPhoto[];
  readonly allowPhotoDownloads?: boolean;
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
}: AboutViewProps) {
  return (
    <AboutSection
      artist={artist}
      genres={genres}
      pressPhotos={pressPhotos}
      allowPhotoDownloads={allowPhotoDownloads}
    />
  );
}
