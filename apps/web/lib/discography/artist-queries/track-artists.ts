/**
 * Track-Artist Relationship Operations
 *
 * Database operations for track-artist junction table.
 */

import { and, eq } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  type NewTrackArtist,
  trackArtists,
} from '@/lib/db/schema';
import type { ArtistWithRole } from './types';

/**
 * Upsert a track-artist relationship
 *
 * On conflict, only updates fields that were explicitly provided to avoid
 * clobbering existing values with defaults.
 *
 * @param input - The track-artist relationship data
 * @param tx - Optional transaction to use for atomicity
 */
export async function upsertTrackArtist(
  input: {
    trackId: string;
    artistId: string;
    role: ArtistRole;
    creditName?: string | null;
    joinPhrase?: string | null;
    position?: number;
    isPrimary?: boolean;
    sourceType?: 'manual' | 'admin' | 'ingested';
    metadata?: Record<string, unknown>;
  },
  tx?: DbOrTransaction
): Promise<typeof trackArtists.$inferSelect> {
  const database = tx ?? db;
  const now = new Date();

  const insertData: NewTrackArtist = {
    trackId: input.trackId,
    artistId: input.artistId,
    role: input.role,
    creditName: input.creditName ?? null,
    joinPhrase: input.joinPhrase ?? null,
    position: input.position ?? 0,
    isPrimary: input.isPrimary ?? false,
    sourceType: input.sourceType ?? 'ingested',
    metadata: input.metadata ?? {},
    createdAt: now,
  };

  // Build update set with only explicitly provided fields to avoid clobbering
  const updateSet: Partial<NewTrackArtist> = {};
  if (input.creditName !== undefined) updateSet.creditName = input.creditName;
  if (input.joinPhrase !== undefined) updateSet.joinPhrase = input.joinPhrase;
  if (input.position !== undefined) updateSet.position = input.position;
  if (input.isPrimary !== undefined) updateSet.isPrimary = input.isPrimary;
  if (input.sourceType !== undefined) updateSet.sourceType = input.sourceType;
  if (input.metadata !== undefined) updateSet.metadata = input.metadata;

  const [result] = await database
    .insert(trackArtists)
    .values(insertData)
    .onConflictDoUpdate({
      target: [trackArtists.trackId, trackArtists.artistId, trackArtists.role],
      set:
        Object.keys(updateSet).length > 0
          ? updateSet
          : { creditName: insertData.creditName },
    })
    .returning();

  return result;
}

/**
 * Get all artists for a track
 */
export async function getArtistsForTrack(
  trackId: string
): Promise<ArtistWithRole[]> {
  const results = await db
    .select({
      artist: artists,
      role: trackArtists.role,
      creditName: trackArtists.creditName,
      joinPhrase: trackArtists.joinPhrase,
      position: trackArtists.position,
      isPrimary: trackArtists.isPrimary,
    })
    .from(trackArtists)
    .innerJoin(artists, eq(trackArtists.artistId, artists.id))
    .where(eq(trackArtists.trackId, trackId))
    .orderBy(trackArtists.position);

  return results.map(r => ({
    ...r.artist,
    role: r.role,
    creditName: r.creditName,
    joinPhrase: r.joinPhrase,
    position: r.position,
    isPrimary: r.isPrimary,
  }));
}

/**
 * Delete all artist relationships for a track
 *
 * @param trackId - The track ID to delete relationships for
 * @param tx - Optional transaction to use for atomicity
 */
export async function deleteTrackArtists(
  trackId: string,
  tx?: DbOrTransaction
): Promise<void> {
  const database = tx ?? db;
  await database.delete(trackArtists).where(eq(trackArtists.trackId, trackId));
}

/**
 * Get all tracks by an artist
 */
export async function getTracksByArtist(
  artistId: string,
  options?: {
    role?: ArtistRole;
    limit?: number;
    offset?: number;
  }
): Promise<Array<{ trackId: string; role: ArtistRole; isPrimary: boolean }>> {
  const { role, limit = 100, offset = 0 } = options ?? {};

  const conditions = [eq(trackArtists.artistId, artistId)];
  if (role) {
    conditions.push(eq(trackArtists.role, role));
  }

  return db
    .select({
      trackId: trackArtists.trackId,
      role: trackArtists.role,
      isPrimary: trackArtists.isPrimary,
    })
    .from(trackArtists)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset);
}
