/**
 * Artist Query Types
 *
 * Shared type definitions for artist query operations.
 */

import type { Artist, ArtistRole } from '@/lib/db/schema';

export interface ArtistWithRole extends Artist {
  role: ArtistRole;
  creditName: string | null;
  joinPhrase: string | null;
  position: number;
  isPrimary: boolean;
}

export interface CollaboratorInfo {
  artist: Artist;
  trackCount: number;
  releaseCount: number;
}

export interface FindOrCreateArtistInput {
  name: string;
  spotifyId?: string | null;
  appleMusicId?: string | null;
  musicbrainzId?: string | null;
  deezerId?: string | null;
  imageUrl?: string | null;
  artistType?:
    | 'person'
    | 'group'
    | 'orchestra'
    | 'choir'
    | 'character'
    | 'other';
  isAutoCreated?: boolean;
  matchConfidence?: string | null;
  creatorProfileId?: string | null;
}
