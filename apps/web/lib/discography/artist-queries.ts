/**
 * Artist Query Functions
 *
 * Database operations for the multi-artist support system.
 * Handles artist lookups, track/release artist relationships,
 * and collaboration queries.
 */

import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type Artist,
  type ArtistRole,
  artists,
  type NewArtist,
  type NewReleaseArtist,
  type NewTrackArtist,
  releaseArtists,
  trackArtists,
} from '@/lib/db/schema';

import { normalizeArtistName, type ParsedArtistCredit } from './artist-parser';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Artist Lookup & Creation
// ============================================================================

/**
 * Find an artist by any external ID or normalized name
 */
export async function findArtist(input: {
  spotifyId?: string | null;
  appleMusicId?: string | null;
  musicbrainzId?: string | null;
  deezerId?: string | null;
  name?: string;
}): Promise<Artist | null> {
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
    const [found] = await db
      .select()
      .from(artists)
      .where(or(...conditions))
      .limit(1);

    if (found) return found;
  }

  // Fallback to normalized name match
  if (input.name) {
    const normalized = normalizeArtistName(input.name);
    const [found] = await db
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
 */
export async function findOrCreateArtist(
  input: FindOrCreateArtistInput
): Promise<Artist> {
  // Try to find existing artist
  const existing = await findArtist({
    spotifyId: input.spotifyId,
    appleMusicId: input.appleMusicId,
    musicbrainzId: input.musicbrainzId,
    deezerId: input.deezerId,
    name: input.name,
  });

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
        updates[field] = input[field] as string;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      const [updated] = await db
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

  const [created] = await db.insert(artists).values(insertData).returning();

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

// ============================================================================
// Track-Artist Relationships
// ============================================================================

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

// ============================================================================
// Release-Artist Relationships
// ============================================================================

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

// ============================================================================
// Batch Operations for Import
// ============================================================================

/**
 * Process parsed artist credits for a track
 *
 * Creates/updates artist records and track-artist relationships
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
    await deleteTrackArtists(trackId);
  }

  const results: ArtistWithRole[] = [];

  for (const credit of credits) {
    // Find or create the artist
    const artist = await findOrCreateArtist({
      name: credit.name,
      spotifyId: credit.spotifyId,
      imageUrl: credit.imageUrl,
      isAutoCreated: !credit.spotifyId, // Auto-created if no Spotify ID
    });

    // Create the track-artist relationship
    await upsertTrackArtist({
      trackId,
      artistId: artist.id,
      role: credit.role,
      joinPhrase: credit.joinPhrase,
      position: credit.position,
      isPrimary: credit.isPrimary,
      sourceType,
    });

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
    await deleteReleaseArtists(releaseId);
  }

  const results: ArtistWithRole[] = [];

  for (const credit of credits) {
    const artist = await findOrCreateArtist({
      name: credit.name,
      spotifyId: credit.spotifyId,
      imageUrl: credit.imageUrl,
      isAutoCreated: !credit.spotifyId,
    });

    await upsertReleaseArtist({
      releaseId,
      artistId: artist.id,
      role: credit.role,
      joinPhrase: credit.joinPhrase,
      position: credit.position,
      isPrimary: credit.isPrimary,
      sourceType,
    });

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

// ============================================================================
// Search & Discovery
// ============================================================================

/**
 * Search artists by name
 */
export async function searchArtists(
  query: string,
  options?: {
    limit?: number;
    excludeIds?: string[];
  }
): Promise<Artist[]> {
  const { limit = 20, excludeIds = [] } = options ?? {};

  const searchPattern = `%${query}%`;
  const nameMatch = or(
    ilike(artists.name, searchPattern),
    ilike(artists.nameNormalized, searchPattern)
  );

  const whereClause =
    excludeIds.length > 0
      ? and(nameMatch, sql`${artists.id} NOT IN ${excludeIds}`)
      : nameMatch;

  return db
    .select()
    .from(artists)
    .where(whereClause)
    .orderBy(artists.name)
    .limit(limit);
}

/**
 * Get frequent collaborators for an artist
 *
 * Finds artists who have appeared on the same tracks
 */
export async function getFrequentCollaborators(
  artistId: string,
  options?: { limit?: number }
): Promise<CollaboratorInfo[]> {
  const { limit = 10 } = options ?? {};

  // Get all track IDs this artist appears on
  const artistTracks = await db
    .select({ trackId: trackArtists.trackId })
    .from(trackArtists)
    .where(eq(trackArtists.artistId, artistId));

  if (artistTracks.length === 0) {
    return [];
  }

  const trackIds = artistTracks.map(t => t.trackId);

  // Find other artists on these tracks
  const collaborators = await db
    .select({
      artistId: trackArtists.artistId,
      trackCount: count(trackArtists.trackId),
    })
    .from(trackArtists)
    .where(
      and(
        inArray(trackArtists.trackId, trackIds),
        sql`${trackArtists.artistId} != ${artistId}`
      )
    )
    .groupBy(trackArtists.artistId)
    .orderBy(desc(count(trackArtists.trackId)))
    .limit(limit);

  // Fetch artist details
  const collaboratorIds = collaborators.map(c => c.artistId);
  if (collaboratorIds.length === 0) {
    return [];
  }

  const artistDetails = await db
    .select()
    .from(artists)
    .where(inArray(artists.id, collaboratorIds));

  const artistMap = new Map(artistDetails.map(a => [a.id, a]));

  return collaborators
    .map(c => {
      const artist = artistMap.get(c.artistId);
      if (!artist) return null;

      return {
        artist,
        trackCount: Number(c.trackCount),
        releaseCount: 0, // TODO: Calculate from release_artists if needed
      };
    })
    .filter((c): c is CollaboratorInfo => c !== null);
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

  const whereClause = role
    ? and(eq(trackArtists.artistId, artistId), eq(trackArtists.role, role))
    : eq(trackArtists.artistId, artistId);

  return db
    .select({
      trackId: trackArtists.trackId,
      role: trackArtists.role,
      isPrimary: trackArtists.isPrimary,
    })
    .from(trackArtists)
    .where(whereClause)
    .limit(limit)
    .offset(offset);
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

  const whereClause = role
    ? and(eq(releaseArtists.artistId, artistId), eq(releaseArtists.role, role))
    : eq(releaseArtists.artistId, artistId);

  return db
    .select({
      releaseId: releaseArtists.releaseId,
      role: releaseArtists.role,
      isPrimary: releaseArtists.isPrimary,
    })
    .from(releaseArtists)
    .where(whereClause)
    .limit(limit)
    .offset(offset);
}
