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
import { determineReleasePhase } from '@/lib/discography/release-phase';

type ReleaseDateInput = Date | string | null | undefined;

export interface PublicReleaseEligibilityInput {
  readonly releaseDate: ReleaseDateInput;
  readonly revealDate?: ReleaseDateInput;
  readonly artworkUrl: string | null | undefined;
  readonly status?: string | null;
  readonly deletedAt?: Date | string | null;
  readonly hasProviderLinks?: boolean;
}

export function hasPublicReleaseArtwork(
  artworkUrl: string | null | undefined
): boolean {
  return typeof artworkUrl === 'string' && artworkUrl.trim().length > 0;
}

export function isPublicReleaseEligible(
  release: PublicReleaseEligibilityInput | null | undefined,
  now = new Date(),
  options: { readonly requireProviderLinks?: boolean } = {}
): boolean {
  if (!release) return false;
  if (release.deletedAt) return false;
  if (release.status === 'draft') return false;
  if (!hasPublicReleaseArtwork(release.artworkUrl)) return false;
  if (options.requireProviderLinks && release.hasProviderLinks !== true) {
    return false;
  }

  return (
    determineReleasePhase(release.releaseDate, release.revealDate, now) !==
    'mystery'
  );
}

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
    )`
  );
}
