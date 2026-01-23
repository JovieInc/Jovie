/**
 * Track-Artist Relationship Operations
 *
 * Database operations for track-artist junction table.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  type NewTrackArtist,
  trackArtists,
} from '@/lib/db/schema';
import type { ArtistWithRole } from './types';

/**
 * Upsert a track-artist relationship
 */
export async function upsertTrackArtist(input: {
  trackId: string;
  artistId: string;
  role: ArtistRole;
  creditName?: string | null;
  joinPhrase?: string | null;
  position?: number;
  isPrimary?: boolean;
  sourceType?: 'manual' | 'admin' | 'ingested';
  metadata?: Record<string, unknown>;
}): Promise<typeof trackArtists.$inferSelect> {
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

  const [result] = await db
    .insert(trackArtists)
    .values(insertData)
    .onConflictDoUpdate({
      target: [trackArtists.trackId, trackArtists.artistId, trackArtists.role],
      set: {
        creditName: input.creditName ?? null,
        joinPhrase: input.joinPhrase ?? null,
        position: input.position ?? 0,
        isPrimary: input.isPrimary ?? false,
        sourceType: input.sourceType ?? 'ingested',
        metadata: input.metadata ?? {},
      },
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
 */
export async function deleteTrackArtists(trackId: string): Promise<void> {
  await db.delete(trackArtists).where(eq(trackArtists.trackId, trackId));
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

  let query = db
    .select({
      trackId: trackArtists.trackId,
      role: trackArtists.role,
      isPrimary: trackArtists.isPrimary,
    })
    .from(trackArtists)
    .where(eq(trackArtists.artistId, artistId))
    .limit(limit)
    .offset(offset);

  if (role) {
    query = db
      .select({
        trackId: trackArtists.trackId,
        role: trackArtists.role,
        isPrimary: trackArtists.isPrimary,
      })
      .from(trackArtists)
      .where(eq(trackArtists.artistId, artistId))
      .limit(limit)
      .offset(offset);
  }

  return query;
}
