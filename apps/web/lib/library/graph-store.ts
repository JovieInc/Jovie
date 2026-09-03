import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { artists, releaseArtists } from '@/lib/db/schema/content';
import { libraryRelationships } from '@/lib/db/schema/library-content-graph';
import {
  youtubeVideoReleaseLinks,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';
import type { LibraryRelationshipView } from './graph-types';
import { isExternalCollaboratorCredit } from './relationships';

function toView(
  relationship: typeof libraryRelationships.$inferSelect
): LibraryRelationshipView {
  return {
    id: relationship.id,
    kind: relationship.kind,
    subjectType: relationship.subjectType,
    subjectId: relationship.subjectId,
    objectType: relationship.objectType,
    objectId: relationship.objectId,
    status: relationship.status,
    createdAt: relationship.createdAt.toISOString(),
  };
}

export async function listLibraryRelationshipsForProfile(
  creatorProfileId: string
): Promise<LibraryRelationshipView[]> {
  const rows = await db
    .select()
    .from(libraryRelationships)
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, creatorProfileId),
        eq(libraryRelationships.status, 'active')
      )
    )
    .orderBy(desc(libraryRelationships.createdAt));
  return rows.map(toView);
}

/**
 * Projects only human-approved YouTube release matches into the Library graph.
 * Credit names and artist identities come from normalized catalog rows; video
 * titles/descriptions are never parsed into collaborator facts.
 */
export async function reconcileApprovedYouTubeCollaborators(
  creatorProfileId: string,
  now = new Date()
): Promise<number> {
  const credits = await db
    .select({
      videoId: youtubeVideos.id,
      linkId: youtubeVideoReleaseLinks.id,
      releaseId: youtubeVideoReleaseLinks.releaseId,
      artistId: artists.id,
      artistName: artists.name,
      artistCreatorProfileId: artists.creatorProfileId,
      role: releaseArtists.role,
      creditName: releaseArtists.creditName,
      isPrimary: releaseArtists.isPrimary,
    })
    .from(youtubeVideoReleaseLinks)
    .innerJoin(
      youtubeVideos,
      eq(youtubeVideos.id, youtubeVideoReleaseLinks.videoId)
    )
    .innerJoin(
      releaseArtists,
      eq(releaseArtists.releaseId, youtubeVideoReleaseLinks.releaseId)
    )
    .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
    .where(
      and(
        eq(youtubeVideos.creatorProfileId, creatorProfileId),
        eq(youtubeVideoReleaseLinks.status, 'approved')
      )
    );

  const current = new Map(
    credits
      .filter(credit => isExternalCollaboratorCredit(creatorProfileId, credit))
      .map(credit => [`${credit.videoId}:${credit.artistId}`, credit] as const)
  );

  await db
    .update(libraryRelationships)
    .set({ status: 'removed', updatedAt: now })
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, creatorProfileId),
        eq(libraryRelationships.kind, 'collaborator_credit'),
        eq(libraryRelationships.subjectType, 'youtube_video'),
        eq(libraryRelationships.status, 'active'),
        drizzleSql`${libraryRelationships.evidence}->>'source' = 'catalog_credit'`
      )
    );

  if (current.size === 0) return 0;
  const values = [...current.values()].map(credit => ({
    creatorProfileId,
    kind: 'collaborator_credit' as const,
    subjectType: 'youtube_video' as const,
    subjectId: credit.videoId,
    objectType: 'artist' as const,
    objectId: credit.artistId,
    status: 'active' as const,
    confidence: '1.0000',
    evidence: {
      source: 'catalog_credit',
      sourceId: credit.linkId,
      rationale: `${credit.creditName?.trim() || credit.artistName} · ${credit.role}`,
      observedAt: now.toISOString(),
    },
    effectiveAt: now,
    expiresAt: null,
    updatedAt: now,
  }));
  await db
    .insert(libraryRelationships)
    .values(values)
    .onConflictDoUpdate({
      target: [
        libraryRelationships.creatorProfileId,
        libraryRelationships.kind,
        libraryRelationships.subjectType,
        libraryRelationships.subjectId,
        libraryRelationships.objectType,
        libraryRelationships.objectId,
      ],
      set: {
        status: 'active',
        confidence: '1.0000',
        evidence: drizzleSql`excluded.evidence`,
        effectiveAt: now,
        expiresAt: null,
        updatedAt: now,
      },
    });
  return current.size;
}
