import 'server-only';

import {
  and,
  count,
  desc,
  sql as drizzleSql,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/lib/db';
import { discogReleases, providerLinks } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { escapeLikePattern } from '@/lib/utils/sql';

export interface AdminReleaseRow {
  id: string;
  title: string;
  slug: string;
  releaseType: string;
  releaseDate: Date | null;
  artworkUrl: string | null;
  totalTracks: number;
  isExplicit: boolean;
  label: string | null;
  upc: string | null;
  sourceType: string;
  spotifyPopularity: number | null;
  createdAt: Date | null;
  // Artist info (from JOIN)
  creatorProfileId: string;
  artistUsername: string;
  artistDisplayName: string | null;
  artistAvatarUrl: string | null;
  artistUserId: string | null;
  // Aggregated
  providerCount: number;
  // Data quality booleans
  missingArtwork: boolean;
  noProviders: boolean;
  noUpc: boolean;
  zeroTracks: boolean;
}

export const adminReleasesSortFields = [
  'release_date_desc',
  'release_date_asc',
  'created_desc',
  'created_asc',
  'title_asc',
  'title_desc',
] as const;

export type AdminReleasesSort = (typeof adminReleasesSortFields)[number];

export interface AdminReleasesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: AdminReleasesSort;
}

export interface AdminReleasesResult {
  releases: AdminReleaseRow[];
  page: number;
  pageSize: number;
  total: number;
}

function sanitizeReleaseSearch(rawSearch?: string): string | undefined {
  if (!rawSearch) return undefined;

  const trimmed = rawSearch.trim();
  if (trimmed.length === 0) return undefined;

  // Enforce a reasonable max length
  const limited = trimmed.slice(0, 100);

  // Only escape LIKE wildcards — preserve all characters including non-ASCII
  // (music titles need "Björk", "Déjà Vu", etc.)
  return escapeLikePattern(limited);
}

function getOrderByExpressions(sort: AdminReleasesSort) {
  // Every branch includes discogReleases.id as a tiebreaker to ensure
  // deterministic ordering for offset pagination (prevents row skipping/duplication).
  switch (sort) {
    case 'release_date_asc':
      return [
        drizzleSql`${discogReleases.releaseDate} ASC NULLS LAST`,
        discogReleases.id,
      ];
    case 'created_asc':
      return [
        drizzleSql`${discogReleases.createdAt} ASC NULLS LAST`,
        discogReleases.id,
      ];
    case 'created_desc':
      return [
        drizzleSql`${discogReleases.createdAt} DESC NULLS LAST`,
        discogReleases.id,
      ];
    case 'title_asc':
      return [discogReleases.title, discogReleases.id];
    case 'title_desc':
      return [desc(discogReleases.title), discogReleases.id];
    case 'release_date_desc':
    default:
      return [
        drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`,
        discogReleases.id,
      ];
  }
}

async function getProviderCountsForReleases(
  releaseIds: string[]
): Promise<Map<string, number>> {
  const countMap = new Map<string, number>();
  if (releaseIds.length === 0) return countMap;

  try {
    const rows = await db
      .select({
        releaseId: providerLinks.releaseId,
        count: drizzleSql<number>`count(*)::int`,
      })
      .from(providerLinks)
      .where(
        and(
          eq(providerLinks.ownerType, 'release'),
          inArray(providerLinks.releaseId, releaseIds)
        )
      )
      .groupBy(providerLinks.releaseId);

    for (const row of rows) {
      if (row.releaseId) {
        countMap.set(row.releaseId, row.count);
      }
    }
  } catch (error) {
    captureError('Failed to load provider counts for admin releases', error, {
      releaseIds,
    });
  }

  return countMap;
}

export async function getAdminReleases(
  params: AdminReleasesParams = {}
): Promise<AdminReleasesResult> {
  const rawPage = Number.isFinite(params.page) ? (params.page ?? 1) : 1;
  const rawPageSize = Number.isFinite(params.pageSize)
    ? (params.pageSize ?? 20)
    : 20;

  const page = Math.max(rawPage || 1, 1);
  const pageSize = Math.min(Math.max(rawPageSize || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const sanitizedSearch = sanitizeReleaseSearch(params.search);
  const likePattern = sanitizedSearch ? `%${sanitizedSearch}%` : null;

  // Runtime validate sort param
  const sort: AdminReleasesSort =
    params.sort && adminReleasesSortFields.includes(params.sort)
      ? params.sort
      : 'release_date_desc';

  const orderByExpressions = getOrderByExpressions(sort);

  // Build where clause for reuse in both queries
  const whereClause: SQL | undefined = likePattern
    ? or(
        ilike(discogReleases.title, likePattern),
        ilike(creatorProfiles.username, likePattern),
        ilike(creatorProfiles.displayName, likePattern)
      )
    : undefined;

  try {
    // Execute data + count queries in parallel
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          id: discogReleases.id,
          title: discogReleases.title,
          slug: discogReleases.slug,
          releaseType: discogReleases.releaseType,
          releaseDate: discogReleases.releaseDate,
          artworkUrl: discogReleases.artworkUrl,
          totalTracks: discogReleases.totalTracks,
          isExplicit: discogReleases.isExplicit,
          label: discogReleases.label,
          upc: discogReleases.upc,
          sourceType: discogReleases.sourceType,
          spotifyPopularity: discogReleases.spotifyPopularity,
          createdAt: discogReleases.createdAt,
          creatorProfileId: discogReleases.creatorProfileId,
          artistUsername: creatorProfiles.username,
          artistDisplayName: creatorProfiles.displayName,
          artistAvatarUrl: creatorProfiles.avatarUrl,
          artistUserId: creatorProfiles.userId,
        })
        .from(discogReleases)
        .innerJoin(
          creatorProfiles,
          eq(discogReleases.creatorProfileId, creatorProfiles.id)
        )
        .where(whereClause)
        .orderBy(...orderByExpressions)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: count() })
        .from(discogReleases)
        .innerJoin(
          creatorProfiles,
          eq(discogReleases.creatorProfileId, creatorProfiles.id)
        )
        .where(whereClause),
    ]);

    const releaseIds = rows.map(r => r.id);

    // Batch-load provider counts
    const providerCounts = await getProviderCountsForReleases(releaseIds);

    return {
      releases: rows.map(row => {
        const providerCount = providerCounts.get(row.id) ?? 0;
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          releaseType: row.releaseType,
          releaseDate: row.releaseDate ?? null,
          artworkUrl: row.artworkUrl ?? null,
          totalTracks: row.totalTracks,
          isExplicit: row.isExplicit,
          label: row.label ?? null,
          upc: row.upc ?? null,
          sourceType: row.sourceType,
          spotifyPopularity: row.spotifyPopularity ?? null,
          createdAt: row.createdAt ?? null,
          creatorProfileId: row.creatorProfileId,
          artistUsername: row.artistUsername,
          artistDisplayName: row.artistDisplayName ?? null,
          artistAvatarUrl: row.artistAvatarUrl ?? null,
          artistUserId: row.artistUserId ?? null,
          providerCount,
          missingArtwork: !row.artworkUrl,
          noProviders: providerCount === 0,
          noUpc: !row.upc,
          zeroTracks: row.totalTracks === 0,
        };
      }),
      page,
      pageSize,
      total,
    };
  } catch (error) {
    captureError('Error loading admin releases', error, {
      page,
      pageSize,
      search: params.search,
    });

    return {
      releases: [],
      page,
      pageSize,
      total: 0,
    };
  }
}
