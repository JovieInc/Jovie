/**
 * Artist Query Types
 *
 * Shared type definitions for artist query operations.
 */

import type { Artist, ArtistRole } from '@/lib/db/schema/content';
import type { PublicArtistCollaboratorRole } from '../artist-credit-policy';

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

export interface CreditedArtistWithProfile {
  /** Display name (credit name when set, otherwise canonical artist name). */
  name: string;
  /** Normalized Jovie handle of the linked public creator profile. */
  handle: string;
}

/** Exact structured relationship used by public collaborator prose. */
export interface StructuredReleaseCollaborator {
  readonly artistId: string;
  readonly name: string;
  /** Stable registry route when a public claimed or unclaimed profile exists. */
  readonly href: string | null;
  readonly profileState: 'claimed' | 'unclaimed' | 'unavailable';
  /** True only when the exact provider identity can drive reconciliation. */
  readonly reconciliationEligible?: boolean;
  readonly role: PublicArtistCollaboratorRole;
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly releaseSlug: string;
  readonly releaseDate: Date | null;
  readonly position: number;
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
