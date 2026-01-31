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
 * The neon-http driver does not support transactions.
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

  // Delete existing relationships if requested
  if (deleteExisting) {
    await deleteTrackArtists(trackId, db);
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
      db
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
      db
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
}

/**
 * Process parsed artist credits for a release
 *
 * The neon-http driver does not support transactions.
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

  if (deleteExisting) {
    await deleteReleaseArtists(releaseId, db);
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
      db
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
      db
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
}
