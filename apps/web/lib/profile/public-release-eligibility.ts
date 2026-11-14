import {
  and,
  sql as drizzleSql,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';

/**
 * SQL twin of `isPublicReleaseEligible`. Server-only: the pure predicate lives
 * in `./public-release-eligibility.shared.ts` so client bundles never reach
 * the Drizzle schema through this file.
 */
export function publicReleaseEligibilitySqlPredicate(
  now: SQL = drizzleSql`NOW()`
) {
  return and(
    isNull(discogReleases.deletedAt),
    ne(discogReleases.status, 'draft'),
    isNotNull(discogReleases.releaseDate),
    drizzleSql`NULLIF(BTRIM(${discogReleases.artworkUrl}), '') IS NOT NULL`,
    or(
      drizzleSql`${discogReleases.releaseDate} <= ${now}`,
      and(
        isNotNull(discogReleases.revealDate),
        drizzleSql`${discogReleases.revealDate} <= ${now}`
      )
    ),
    drizzleSql`EXISTS (
      SELECT 1
      FROM ${providerLinks}
      WHERE ${providerLinks.releaseId} = ${discogReleases.id}
        AND ${providerLinks.ownerType} = 'release'
        AND NULLIF(BTRIM(${providerLinks.url}), '') IS NOT NULL
    )`,
    drizzleSql`EXISTS (
      SELECT 1
      FROM ${libraryAssetApprovalStatuses}
      WHERE ${libraryAssetApprovalStatuses.assetId} = ${discogReleases.id}::text
        AND ${libraryAssetApprovalStatuses.creatorProfileId} = ${discogReleases.creatorProfileId}
        AND ${libraryAssetApprovalStatuses.approvalStatus} = 'approved'
        AND ${libraryAssetApprovalStatuses.profileVisibility} = 'visible'
    )`
  );
}
