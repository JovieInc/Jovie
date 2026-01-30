/**
 * Artist CRUD Operations
 *
 * Core artist lookup and creation functions.
 */

import { eq, or } from 'drizzle-orm';
import { db, type TransactionType } from '@/lib/db';
import { type Artist, artists, type NewArtist } from '@/lib/db/schema';
import { normalizeArtistName } from '../artist-parser';
import type { FindOrCreateArtistInput } from './types';

/**
 * Find an artist by any external ID or normalized name
 *
 * @param input - Search criteria (external IDs or name)
 * @param tx - Optional transaction to use for atomicity
 */
export async function findArtist(
  input: {
    spotifyId?: string | null;
    appleMusicId?: string | null;
    musicbrainzId?: string | null;
    deezerId?: string | null;
    name?: string;
  },
  tx?: TransactionType
): Promise<Artist | null> {
  const database = tx ?? db;
  const conditions = [];

  // Prefer external IDs for matching (most reliable)
  if (input.spotifyId) {
    conditions.push(eq(artists.spotifyId, input.spotifyId));
  }
  if (input.appleMusicId) {
    conditions.push(eq(artists.appleMusicId, input.appleMusicId));
  }
  if (input.musicbrainzId) {
    conditions.push(eq(artists.musicbrainzId, input.musicbrainzId));
  }
  if (input.deezerId) {
    conditions.push(eq(artists.deezerId, input.deezerId));
  }

  // Try external IDs first
  if (conditions.length > 0) {
    const [found] = await database
      .select()
      .from(artists)
      .where(or(...conditions))
      .limit(1);

    if (found) return found;
  }

  // Fallback to normalized name match
  if (input.name) {
    const normalized = normalizeArtistName(input.name);
    const [found] = await database
      .select()
      .from(artists)
      .where(eq(artists.nameNormalized, normalized))
      .limit(1);

    return found ?? null;
  }

  return null;
}

/**
 * Find or create an artist
 *
 * First tries to find by external IDs, then by normalized name.
 * If not found, creates a new artist record.
 *
 * @param input - Artist data for find/create
 * @param tx - Optional transaction to use for atomicity
 */
export async function findOrCreateArtist(
  input: FindOrCreateArtistInput,
  tx?: TransactionType
): Promise<Artist> {
  const database = tx ?? db;

  // Try to find existing artist
  const existing = await findArtist(
    {
      spotifyId: input.spotifyId,
      appleMusicId: input.appleMusicId,
      musicbrainzId: input.musicbrainzId,
      deezerId: input.deezerId,
      name: input.name,
    },
    tx
  );

  if (existing) {
    // Update with any new external IDs we have (only fill in missing fields)
    const updates: Partial<NewArtist> = {};
    const fieldsToMerge = [
      'spotifyId',
      'appleMusicId',
      'musicbrainzId',
      'deezerId',
      'imageUrl',
      'creatorProfileId',
    ] as const;

    for (const field of fieldsToMerge) {
      if (input[field] && !existing[field]) {
        updates[field] = input[field];
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      const [updated] = await database
        .update(artists)
        .set(updates)
        .where(eq(artists.id, existing.id))
        .returning();

      return updated ?? existing;
    }

    return existing;
  }

  // Create new artist
  const now = new Date();
  const normalized = normalizeArtistName(input.name);

  const insertData: NewArtist = {
    name: input.name,
    nameNormalized: normalized,
    spotifyId: input.spotifyId ?? null,
    appleMusicId: input.appleMusicId ?? null,
    musicbrainzId: input.musicbrainzId ?? null,
    deezerId: input.deezerId ?? null,
    imageUrl: input.imageUrl ?? null,
    artistType: input.artistType ?? 'person',
    isAutoCreated: input.isAutoCreated ?? true,
    matchConfidence: input.matchConfidence ?? null,
    creatorProfileId: input.creatorProfileId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const [created] = await database
    .insert(artists)
    .values(insertData)
    .returning();

  return created;
}

/**
 * Get an artist by ID
 */
export async function getArtistById(artistId: string): Promise<Artist | null> {
  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1);

  return artist ?? null;
}

/**
 * Get artist by creator profile ID
 */
export async function getArtistByCreatorProfile(
  creatorProfileId: string
): Promise<Artist | null> {
  const [artist] = await db
    .select()
    .from(artists)
    .where(eq(artists.creatorProfileId, creatorProfileId))
    .limit(1);

  return artist ?? null;
}
