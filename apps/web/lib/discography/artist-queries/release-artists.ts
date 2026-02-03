/**
 * Release-Artist Relationship Operations
 *
 * Database operations for release-artist junction table.
 */

import { and, eq } from 'drizzle-orm';
import { type DbOrTransaction, db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  type NewReleaseArtist,
  releaseArtists,
} from '@/lib/db/schema/content';
import type { ArtistWithRole } from './types';

/**
 * Upsert a release-artist relationship
 *
 * On conflict, only updates fields that were explicitly provided to avoid
 * clobbering existing values with defaults.
 *
 * @param input - The release-artist relationship data
 * @param tx - Optional transaction to use for atomicity
 */
export async function upsertReleaseArtist(
  input: {
    releaseId: string;
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
): Promise<typeof releaseArtists.$inferSelect> {
  const database = tx ?? db;
  const now = new Date();

  const insertData: NewReleaseArtist = {
    releaseId: input.releaseId,
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
  const updateSet: Partial<NewReleaseArtist> = {};
  if (input.creditName !== undefined) updateSet.creditName = input.creditName;
  if (input.joinPhrase !== undefined) updateSet.joinPhrase = input.joinPhrase;
  if (input.position !== undefined) updateSet.position = input.position;
  if (input.isPrimary !== undefined) updateSet.isPrimary = input.isPrimary;
  if (input.sourceType !== undefined) updateSet.sourceType = input.sourceType;
  if (input.metadata !== undefined) updateSet.metadata = input.metadata;

  const [result] = await database
    .insert(releaseArtists)
    .values(insertData)
    .onConflictDoUpdate({
      target: [
        releaseArtists.releaseId,
        releaseArtists.artistId,
        releaseArtists.role,
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
 * Get all artists for a release
 */
export async function getArtistsForRelease(
  releaseId: string
): Promise<ArtistWithRole[]> {
  const results = await db
    .select({
      artist: artists,
      role: releaseArtists.role,
      creditName: releaseArtists.creditName,
      joinPhrase: releaseArtists.joinPhrase,
      position: releaseArtists.position,
      isPrimary: releaseArtists.isPrimary,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .where(eq(releaseArtists.releaseId, releaseId))
    .orderBy(releaseArtists.position);

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
 * Delete all artist relationships for a release
 *
 * @param releaseId - The release ID to delete relationships for
 * @param tx - Optional transaction to use for atomicity
 */
export async function deleteReleaseArtists(
  releaseId: string,
  tx?: DbOrTransaction
): Promise<void> {
  const database = tx ?? db;
  await database
    .delete(releaseArtists)
    .where(eq(releaseArtists.releaseId, releaseId));
}

/**
 * Get all releases by an artist
 */
export async function getReleasesByArtist(
  artistId: string,
  options?: {
    role?: ArtistRole;
    limit?: number;
    offset?: number;
  }
): Promise<Array<{ releaseId: string; role: ArtistRole; isPrimary: boolean }>> {
  const { role, limit = 100, offset = 0 } = options ?? {};

  const conditions = [eq(releaseArtists.artistId, artistId)];
  if (role) {
    conditions.push(eq(releaseArtists.role, role));
  }

  return db
    .select({
      releaseId: releaseArtists.releaseId,
      role: releaseArtists.role,
      isPrimary: releaseArtists.isPrimary,
    })
    .from(releaseArtists)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset);
}
