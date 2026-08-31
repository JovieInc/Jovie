import 'server-only';

import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { artists, releaseArtists } from '@/lib/db/schema/content';
import { libraryRelationships } from '@/lib/db/schema/library-graph';
import { merchCards } from '@/lib/db/schema/merch';
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

export async function tagYouTubeVideoWithMerch(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
  readonly merchCardId: string;
  readonly actorUserId: string;
}): Promise<LibraryRelationshipView | null> {
  const [video, merch] = await Promise.all([
    db
      .select({ id: youtubeVideos.id })
      .from(youtubeVideos)
      .where(
        and(
          eq(youtubeVideos.id, input.videoId),
          eq(youtubeVideos.creatorProfileId, input.creatorProfileId)
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
    db
      .select({ id: merchCards.id })
      .from(merchCards)
      .where(
        and(
          eq(merchCards.id, input.merchCardId),
          eq(merchCards.creatorProfileId, input.creatorProfileId)
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
  ]);
  if (!video || !merch) return null;

  const now = new Date();
  const [relationship] = await db
    .insert(libraryRelationships)
    .values({
      creatorProfileId: input.creatorProfileId,
      kind: 'features_merch',
      subjectType: 'youtube_video',
      subjectId: video.id,
      objectType: 'merch_product',
      objectId: merch.id,
      status: 'active',
      confidence: '1.0000',
      evidence: {
        source: 'artist_confirmation',
        sourceId: input.actorUserId,
        observedAt: now.toISOString(),
      },
      reviewedBy: input.actorUserId,
      reviewedAt: now,
      effectiveAt: now,
      updatedAt: now,
    })
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
        evidence: {
          source: 'artist_confirmation',
          sourceId: input.actorUserId,
          observedAt: now.toISOString(),
        },
        reviewedBy: input.actorUserId,
        reviewedAt: now,
        effectiveAt: now,
        expiresAt: null,
        updatedAt: now,
      },
    })
    .returning();
  return relationship ? toView(relationship) : null;
}

export async function removeYouTubeVideoMerchTag(input: {
  readonly creatorProfileId: string;
  readonly videoId: string;
  readonly merchCardId: string;
}): Promise<boolean> {
  const [updated] = await db
    .update(libraryRelationships)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, input.creatorProfileId),
        eq(libraryRelationships.kind, 'features_merch'),
        eq(libraryRelationships.subjectType, 'youtube_video'),
        eq(libraryRelationships.subjectId, input.videoId),
        eq(libraryRelationships.objectType, 'merch_product'),
        eq(libraryRelationships.objectId, input.merchCardId),
        eq(libraryRelationships.status, 'active')
      )
    )
    .returning({ id: libraryRelationships.id });
  return Boolean(updated);
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

  if (current.size > 0) {
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
  }

  const staleRelationshipFilter =
    current.size === 0
      ? drizzleSql`true`
      : drizzleSql`(${libraryRelationships.subjectId}, ${libraryRelationships.objectId}) not in (${drizzleSql.join(
          [...current.values()].map(
            credit => drizzleSql`(${credit.videoId}, ${credit.artistId})`
          ),
          drizzleSql`, `
        )})`;

  await db
    .update(libraryRelationships)
    .set({ status: 'removed', updatedAt: now })
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, creatorProfileId),
        eq(libraryRelationships.kind, 'collaborator_credit'),
        eq(libraryRelationships.subjectType, 'youtube_video'),
        eq(libraryRelationships.status, 'active'),
        drizzleSql`${libraryRelationships.evidence}->>'source' = 'catalog_credit'`,
        staleRelationshipFilter
      )
    );

  return current.size;
}
