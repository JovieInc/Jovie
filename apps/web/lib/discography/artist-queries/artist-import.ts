/**
 * Artist Import Operations
 *
 * Batch operations for processing artist credits during import.
 * All operations are wrapped in transactions for atomicity.
 */

import { db } from '@/lib/db';
import type { ParsedArtistCredit } from '../artist-parser';
import { findOrCreateArtist } from './artist-crud';
import { deleteReleaseArtists, upsertReleaseArtist } from './release-artists';
import { deleteTrackArtists, upsertTrackArtist } from './track-artists';
import type { ArtistWithRole } from './types';

/**
 * Process parsed artist credits for a track
 *
 * Creates/updates artist records and track-artist relationships.
 * All operations are wrapped in a transaction for atomicity.
 */
export async function processTrackArtistCredits(
  trackId: string,
  credits: ParsedArtistCredit[],
  options?: {
    deleteExisting?: boolean;
    sourceType?: 'manual' | 'admin' | 'ingested';
  }
): Promise<ArtistWithRole[]> {
  const { deleteExisting = true, sourceType = 'ingested' } = options ?? {};

  return db.transaction(async tx => {
    // Delete existing relationships if requested
    if (deleteExisting) {
      await deleteTrackArtists(trackId, tx);
    }

    const results: ArtistWithRole[] = [];

    for (const credit of credits) {
      // Find or create the artist
      const artist = await findOrCreateArtist(
        {
          name: credit.name,
          spotifyId: credit.spotifyId,
          imageUrl: credit.imageUrl,
          isAutoCreated: !credit.spotifyId, // Auto-created if no Spotify ID
        },
        tx
      );

      // Create the track-artist relationship
      await upsertTrackArtist(
        {
          trackId,
          artistId: artist.id,
          role: credit.role,
          joinPhrase: credit.joinPhrase,
          position: credit.position,
          isPrimary: credit.isPrimary,
          sourceType,
        },
        tx
      );

      results.push({
        ...artist,
        role: credit.role,
        creditName: null,
        joinPhrase: credit.joinPhrase,
        position: credit.position,
        isPrimary: credit.isPrimary,
      });
    }

    return results;
  });
}

/**
 * Process parsed artist credits for a release
 *
 * All operations are wrapped in a transaction for atomicity.
 */
export async function processReleaseArtistCredits(
  releaseId: string,
  credits: ParsedArtistCredit[],
  options?: {
    deleteExisting?: boolean;
    sourceType?: 'manual' | 'admin' | 'ingested';
  }
): Promise<ArtistWithRole[]> {
  const { deleteExisting = true, sourceType = 'ingested' } = options ?? {};

  return db.transaction(async tx => {
    if (deleteExisting) {
      await deleteReleaseArtists(releaseId, tx);
    }

    const results: ArtistWithRole[] = [];

    for (const credit of credits) {
      const artist = await findOrCreateArtist(
        {
          name: credit.name,
          spotifyId: credit.spotifyId,
          imageUrl: credit.imageUrl,
          isAutoCreated: !credit.spotifyId,
        },
        tx
      );

      await upsertReleaseArtist(
        {
          releaseId,
          artistId: artist.id,
          role: credit.role,
          joinPhrase: credit.joinPhrase,
          position: credit.position,
          isPrimary: credit.isPrimary,
          sourceType,
        },
        tx
      );

      results.push({
        ...artist,
        role: credit.role,
        creditName: null,
        joinPhrase: credit.joinPhrase,
        position: credit.position,
        isPrimary: credit.isPrimary,
      });
    }

    return results;
  });
}
