import { and, asc, desc, sql as drizzleSql, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { creatorDocuments } from '@/lib/db/schema/creator-documents';
import { libraryRelationships } from '@/lib/db/schema/library-content-graph';

export class CatalogSelectionUnavailable extends Error {}

export function selectedPromotionWork(profileId: string, releaseId: string) {
  return db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      status: discogReleases.status,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, profileId),
        eq(discogReleases.id, releaseId),
        isNull(discogReleases.deletedAt),
        ne(discogReleases.status, 'draft')
      )
    )
    .limit(1);
}

export async function selectedReleaseDestinations(releaseId: string) {
  return db
    .select({
      provider: providerLinks.providerId,
      id: providerLinks.externalId,
      url: providerLinks.url,
    })
    .from(providerLinks)
    .where(
      and(
        eq(providerLinks.releaseId, releaseId),
        eq(providerLinks.ownerType, 'release'),
        eq(providerLinks.sourceType, 'ingested')
      )
    )
    .orderBy(desc(providerLinks.isPrimary), asc(providerLinks.providerId));
}

/** A selected work and its first private revision commit in the same statement. */
export function promotionCaptureSql(profileId: string, releaseId: string) {
  return {
    eligible: drizzleSql`exists (${selectedPromotionWork(profileId, releaseId)})`,
    relationship: drizzleSql`, linked as (
      insert into ${libraryRelationships} (
        creator_profile_id, kind, subject_type, subject_id, object_type, object_id, status, evidence
      )
      select ${profileId}, 'release_context', 'creator_document', target_document.id::text,
        'release', ${releaseId}, 'active', '{"source":"creator_selected_work"}'::jsonb
      from target_document where target_document.created
      returning subject_id
    )`,
  };
}

export async function findCapturedPromotion(
  profileId: string,
  captureKey: string,
  releaseId: string
): Promise<string | null> {
  const links = libraryRelationships;
  const [match] = await db
    .select({ id: creatorDocuments.id })
    .from(creatorDocuments)
    .innerJoin(
      links,
      eq(links.subjectId, drizzleSql`${creatorDocuments.id}::text`)
    )
    .where(
      and(
        eq(creatorDocuments.creatorProfileId, profileId),
        eq(creatorDocuments.captureIdempotencyKey, captureKey),
        eq(links.creatorProfileId, profileId),
        eq(links.kind, 'release_context'),
        eq(links.subjectType, 'creator_document'),
        eq(links.objectType, 'release'),
        eq(links.objectId, releaseId),
        eq(links.status, 'active')
      )
    )
    .limit(1);
  return match?.id ?? null;
}
