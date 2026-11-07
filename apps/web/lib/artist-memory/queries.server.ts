import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  memoryEntities,
  memoryObservations,
  memorySourceRecords,
} from '@/lib/db/schema/memory';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type ArtistMemoryFact,
  type MemoryAudience,
  projectArtistMemory,
} from './contract';
import { observationToMemoryFact, profileToMemoryFacts } from './from-sources';

/** Abuse limit: learned observations read per request. */
export const ARTIST_MEMORY_OBSERVATION_LIMIT = 200;

const iso = (d: Date | null | undefined) => (d ?? new Date(0)).toISOString();

/**
 * Read everything Jovie knows about one artist profile, projected for the
 * audience. The caller decides the audience after authorization: pass `owner`
 * only when the authenticated user owns the profile.
 */
export async function loadArtistMemory(
  profileId: string,
  audience: MemoryAudience
): Promise<ArtistMemoryFact[]> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      bio: creatorProfiles.bio,
      careerHighlights: creatorProfiles.careerHighlights,
      genres: creatorProfiles.genres,
      location: creatorProfiles.location,
      activeSinceYear: creatorProfiles.activeSinceYear,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  if (!profile) return [];

  const observations = await db
    .select({
      id: memoryObservations.id,
      fact: memoryObservations.fact,
      status: memoryObservations.status,
      confidence: memoryObservations.confidence,
      sourceRecordId: memoryObservations.sourceRecordId,
      sourceType: memorySourceRecords.sourceType,
      createdAt: memoryObservations.createdAt,
    })
    .from(memoryObservations)
    .innerJoin(
      memoryEntities,
      eq(memoryObservations.entityId, memoryEntities.id)
    )
    .leftJoin(
      memorySourceRecords,
      eq(memoryObservations.sourceRecordId, memorySourceRecords.id)
    )
    .where(
      and(
        eq(memoryEntities.creatorProfileId, profileId),
        eq(memoryEntities.type, 'artist')
      )
    )
    .orderBy(desc(memoryObservations.createdAt))
    .limit(ARTIST_MEMORY_OBSERVATION_LIMIT);

  const facts = [
    ...profileToMemoryFacts({ ...profile, updatedAt: iso(profile.updatedAt) }),
    ...observations.map(o =>
      observationToMemoryFact({
        ...o,
        profileId,
        createdAt: iso(o.createdAt),
      })
    ),
  ];
  return projectArtistMemory(facts, audience);
}
