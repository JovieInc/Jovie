/**
 * Recording-Artist Relationship Operations
 *
 * Database operations for recording-artist junction table.
 * Mirrors track-artists.ts but references discog_recordings instead of discog_tracks.
 */

import { and, eq } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  type NewRecordingArtist,
  recordingArtists,
} from '@/lib/db/schema/content';
import type { ArtistWithRole } from './types';

/**
 * Upsert a recording-artist relationship
 *
 * On conflict, only updates fields that were explicitly provided to avoid
 * clobbering existing values with defaults.
 */
export async function upsertRecordingArtist(
  input: {
    recordingId: string;
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
): Promise<typeof recordingArtists.$inferSelect> {
  const database = tx ?? db;
  const now = new Date();

  const insertData: NewRecordingArtist = {
    recordingId: input.recordingId,
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
  const updateSet: Partial<NewRecordingArtist> = {};
  if (input.creditName !== undefined) updateSet.creditName = input.creditName;
  if (input.joinPhrase !== undefined) updateSet.joinPhrase = input.joinPhrase;
  if (input.position !== undefined) updateSet.position = input.position;
  if (input.isPrimary !== undefined) updateSet.isPrimary = input.isPrimary;
  if (input.sourceType !== undefined) updateSet.sourceType = input.sourceType;
  if (input.metadata !== undefined) updateSet.metadata = input.metadata;

  const [result] = await database
    .insert(recordingArtists)
    .values(insertData)
    .onConflictDoUpdate({
      target: [
        recordingArtists.recordingId,
        recordingArtists.artistId,
        recordingArtists.role,
      ],
      set:
        Object.keys(updateSet).length > 0
          ? updateSet
          : { creditName: insertData.creditName },
    })
    .returning();

  return result;
}

/**
 * Get all artists for a recording
 */
export async function getArtistsForRecording(
  recordingId: string
): Promise<ArtistWithRole[]> {
  const results = await db
    .select({
      artist: artists,
      role: recordingArtists.role,
      creditName: recordingArtists.creditName,
      joinPhrase: recordingArtists.joinPhrase,
      position: recordingArtists.position,
      isPrimary: recordingArtists.isPrimary,
    })
    .from(recordingArtists)
    .innerJoin(artists, eq(recordingArtists.artistId, artists.id))
    .where(eq(recordingArtists.recordingId, recordingId))
    .orderBy(recordingArtists.position);

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
 * Delete all artist relationships for a recording
 */
export async function deleteRecordingArtists(
  recordingId: string,
  tx?: DbOrTransaction
): Promise<void> {
  const database = tx ?? db;
  await database
    .delete(recordingArtists)
    .where(eq(recordingArtists.recordingId, recordingId));
}

/**
 * Get all recordings by an artist
 */
export async function getRecordingsByArtist(
  artistId: string,
  options?: {
    role?: ArtistRole;
    limit?: number;
    offset?: number;
  }
): Promise<
  Array<{ recordingId: string; role: ArtistRole; isPrimary: boolean }>
> {
  const { role, limit = 100, offset = 0 } = options ?? {};

  const conditions = [eq(recordingArtists.artistId, artistId)];
  if (role) {
    conditions.push(eq(recordingArtists.role, role));
  }

  return db
    .select({
      recordingId: recordingArtists.recordingId,
      role: recordingArtists.role,
      isPrimary: recordingArtists.isPrimary,
    })
    .from(recordingArtists)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset);
}
