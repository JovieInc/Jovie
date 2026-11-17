import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
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
    eligible: sql`exists (${selectedPromotionWork(profileId, releaseId)})`,
    relationship: sql`, linked as (
      insert into ${libraryRelationships} (
        creator_profile_id, kind, subject_type, subject_id, object_type, object_id, status, evidence
      )
      select ${profileId}, 'release_context', 'creator_document', target_document.id::text,
        'release', ${releaseId}, 'active', '{"source":"creator_selected_work"}'::jsonb
      from target_document where target_document.created
      returning subject_id
    )`,
    confirmed: sql`where exists (select 1 from linked where subject_id = target_document.id::text)
      or exists (
        select 1 from ${libraryRelationships} r where r.creator_profile_id = ${profileId}
          and r.kind = 'release_context' and r.subject_type = 'creator_document'
          and r.subject_id = target_document.id::text and r.object_type = 'release'
          and r.object_id = ${releaseId} and r.status = 'active'
      )`,
  };
}
