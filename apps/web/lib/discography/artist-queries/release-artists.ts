/**
 * Release-Artist Relationship Operations
 *
 * Database operations for release-artist junction table.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type ArtistRole,
  artists,
  type NewReleaseArtist,
  releaseArtists,
} from '@/lib/db/schema';
import type { ArtistWithRole } from './types';

/**
 * Upsert a release-artist relationship
 */
export async function upsertReleaseArtist(input: {
  releaseId: string;
  artistId: string;
  role: ArtistRole;
  creditName?: string | null;
  joinPhrase?: string | null;
  position?: number;
  isPrimary?: boolean;
  sourceType?: 'manual' | 'admin' | 'ingested';
  metadata?: Record<string, unknown>;
}): Promise<typeof releaseArtists.$inferSelect> {
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

  const [result] = await db
    .insert(releaseArtists)
    .values(insertData)
    .onConflictDoUpdate({
      target: [
        releaseArtists.releaseId,
        releaseArtists.artistId,
        releaseArtists.role,
      ],
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
 */
export async function deleteReleaseArtists(releaseId: string): Promise<void> {
  await db
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
  const { limit = 100, offset = 0 } = options ?? {};

  return db
    .select({
      releaseId: releaseArtists.releaseId,
      role: releaseArtists.role,
      isPrimary: releaseArtists.isPrimary,
    })
    .from(releaseArtists)
    .where(eq(releaseArtists.artistId, artistId))
    .limit(limit)
    .offset(offset);
}
