import 'server-only';

import {
  and,
  count,
  sql as drizzleSql,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { escapeLikePattern } from '@/lib/utils/sql';

/**
 * Canonical asset library (JOV-6889).
 *
 * One aggregate query across the per-subsystem content tables — releases,
 * release tracks, social links, and profile media — preserving ownership and
 * provenance so founders and agents can scan the whole customer corpus and
 * surface malformed/incomplete assets without hopping between tables.
 */

export const adminAssetTypes = ['release', 'track', 'link', 'photo'] as const;
export type AdminAssetType = (typeof adminAssetTypes)[number];

export const adminAssetIssuesFilters = ['all', 'issues'] as const;
export type AdminAssetIssuesFilter = (typeof adminAssetIssuesFilters)[number];

export const adminAssetVerifiedFilters = [
  'all',
  'verified',
  'unverified',
] as const;
export type AdminAssetVerifiedFilter =
  (typeof adminAssetVerifiedFilters)[number];

export const adminAssetSortFields = [
  'created_desc',
  'created_asc',
  'title_asc',
  'title_desc',
] as const;
export type AdminAssetSort = (typeof adminAssetSortFields)[number];

export interface AdminAssetRow {
  id: string;
  assetType: AdminAssetType;
  title: string;
  subtitle: string | null;
  href: string | null;
  thumbnailUrl: string | null;
  status: string;
  sourceType: string;
  isExplicit: boolean;
  /** Data-quality flags surfaced as pills (e.g. "No artwork", "Failed"). */
  issues: string[];
  createdAt: Date | null;
  // Ownership / provenance (LEFT JOIN — photos can be orphaned)
  ownerUsername: string | null;
  ownerDisplayName: string | null;
  ownerAvatarUrl: string | null;
  ownerUserId: string | null;
  ownerIsVerified: boolean;
}

export interface AdminAssetsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: AdminAssetSort;
  type?: AdminAssetType | 'all';
  issues?: AdminAssetIssuesFilter;
  verified?: AdminAssetVerifiedFilter;
}

export interface AdminAssetsResult {
  assets: AdminAssetRow[];
  page: number;
  pageSize: number;
  total: number;
}

function sanitizeAssetSearch(rawSearch?: string): string | undefined {
  if (!rawSearch) return undefined;
  const trimmed = rawSearch.trim();
  if (trimmed.length === 0) return undefined;
  return escapeLikePattern(trimmed.slice(0, 100));
}

/** Owner certification-state predicate shared by every asset source. */
function ownerVerifiedCondition(
  filter: AdminAssetVerifiedFilter
): SQL | undefined {
  if (filter === 'verified') {
    return eq(creatorProfiles.isVerified, true);
  }
  if (filter === 'unverified') {
    // NULL owner (orphaned photos) counts as unverified.
    return or(
      eq(creatorProfiles.isVerified, false),
      isNull(creatorProfiles.isVerified)
    );
  }
  return undefined;
}

function orderExpressions(
  sort: AdminAssetSort,
  columns: { title: unknown; createdAt: unknown }
): SQL[] {
  switch (sort) {
    case 'created_asc':
      return [drizzleSql`${columns.createdAt} ASC NULLS LAST`];
    case 'title_asc':
      return [drizzleSql`${columns.title} ASC NULLS LAST`];
    case 'title_desc':
      return [drizzleSql`${columns.title} DESC NULLS LAST`];
    case 'created_desc':
    default:
      return [drizzleSql`${columns.createdAt} DESC NULLS LAST`];
  }
}

const OWNER_SELECT = {
  ownerUsername: creatorProfiles.username,
  ownerDisplayName: creatorProfiles.displayName,
  ownerAvatarUrl: creatorProfiles.avatarUrl,
  ownerUserId: creatorProfiles.userId,
  ownerIsVerified: creatorProfiles.isVerified,
} as const;

interface FetchContext {
  likePattern: string | null;
  issuesOnly: boolean;
  verified: AdminAssetVerifiedFilter;
  sort: AdminAssetSort;
  limit: number;
}

async function fetchReleaseAssets(
  ctx: FetchContext
): Promise<{ rows: AdminAssetRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    ctx.likePattern
      ? or(
          ilike(discogReleases.title, ctx.likePattern),
          ilike(discogReleases.upc, ctx.likePattern),
          ilike(discogReleases.label, ctx.likePattern),
          ilike(creatorProfiles.username, ctx.likePattern),
          ilike(creatorProfiles.displayName, ctx.likePattern)
        )
      : undefined,
    ownerVerifiedCondition(ctx.verified),
  ];

  if (ctx.issuesOnly) {
    conditions.push(
      or(
        isNull(discogReleases.artworkUrl),
        isNull(discogReleases.upc),
        eq(discogReleases.totalTracks, 0),
        isNull(discogReleases.releaseDate),
        isNotNull(discogReleases.deletedAt),
        drizzleSql`NOT EXISTS (
          SELECT 1 FROM ${providerLinks}
          WHERE ${providerLinks.ownerType} = 'release'
            AND ${providerLinks.releaseId} = ${discogReleases.id}
        )`
      )
    );
  }

  const whereClause = and(...conditions);
  const orderBy = orderExpressions(ctx.sort, {
    title: discogReleases.title,
    createdAt: discogReleases.createdAt,
  });

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        slug: discogReleases.slug,
        releaseType: discogReleases.releaseType,
        status: discogReleases.status,
        artworkUrl: discogReleases.artworkUrl,
        upc: discogReleases.upc,
        totalTracks: discogReleases.totalTracks,
        releaseDate: discogReleases.releaseDate,
        deletedAt: discogReleases.deletedAt,
        isExplicit: discogReleases.isExplicit,
        sourceType: discogReleases.sourceType,
        createdAt: discogReleases.createdAt,
        ...OWNER_SELECT,
      })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(ctx.limit),
    db
      .select({ value: count() })
      .from(discogReleases)
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause),
  ]);

  // Provider counts power the "No providers" issue pill.
  const releaseIds = rows.map(r => r.id);
  const providerCounts = new Map<string, number>();
  if (releaseIds.length > 0) {
    const counts = await db
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
    for (const row of counts) {
      if (row.releaseId) providerCounts.set(row.releaseId, row.count);
    }
  }

  return {
    total,
    rows: rows.map(row => {
      const issues: string[] = [];
      if (!row.artworkUrl) issues.push('No artwork');
      if (!row.upc) issues.push('No UPC');
      if (row.totalTracks === 0) issues.push('0 tracks');
      if (!row.releaseDate) issues.push('No release date');
      if (row.deletedAt) issues.push('Deleted');
      if ((providerCounts.get(row.id) ?? 0) === 0) issues.push('No providers');
      return {
        id: row.id,
        assetType: 'release',
        title: row.title,
        subtitle: row.releaseType,
        href: row.ownerUsername ? `/${row.ownerUsername}/${row.slug}` : null,
        thumbnailUrl: row.artworkUrl ?? null,
        status: row.deletedAt ? 'deleted' : row.status,
        sourceType: row.sourceType,
        isExplicit: row.isExplicit,
        issues,
        createdAt: row.createdAt ?? null,
        ownerUsername: row.ownerUsername ?? null,
        ownerDisplayName: row.ownerDisplayName ?? null,
        ownerAvatarUrl: row.ownerAvatarUrl ?? null,
        ownerUserId: row.ownerUserId ?? null,
        ownerIsVerified: row.ownerIsVerified ?? false,
      };
    }),
  };
}

async function fetchTrackAssets(
  ctx: FetchContext
): Promise<{ rows: AdminAssetRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    ctx.likePattern
      ? or(
          ilike(discogReleaseTracks.title, ctx.likePattern),
          ilike(discogReleases.title, ctx.likePattern),
          ilike(discogRecordings.isrc, ctx.likePattern),
          ilike(creatorProfiles.username, ctx.likePattern),
          ilike(creatorProfiles.displayName, ctx.likePattern)
        )
      : undefined,
    ownerVerifiedCondition(ctx.verified),
  ];

  if (ctx.issuesOnly) {
    conditions.push(
      or(
        isNull(discogRecordings.isrc),
        isNull(discogRecordings.durationMs),
        and(
          isNull(discogRecordings.audioUrl),
          isNull(discogRecordings.previewUrl)
        )
      )
    );
  }

  const whereClause = and(...conditions);
  const orderBy = orderExpressions(ctx.sort, {
    title: discogReleaseTracks.title,
    createdAt: discogReleaseTracks.createdAt,
  });

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: discogReleaseTracks.id,
        title: discogReleaseTracks.title,
        trackNumber: discogReleaseTracks.trackNumber,
        isExplicit: discogReleaseTracks.isExplicit,
        sourceType: discogReleaseTracks.sourceType,
        createdAt: discogReleaseTracks.createdAt,
        releaseTitle: discogReleases.title,
        releaseSlug: discogReleases.slug,
        releaseStatus: discogReleases.status,
        releaseDeletedAt: discogReleases.deletedAt,
        releaseArtworkUrl: discogReleases.artworkUrl,
        recordingIsrc: discogRecordings.isrc,
        recordingDurationMs: discogRecordings.durationMs,
        recordingAudioUrl: discogRecordings.audioUrl,
        recordingPreviewUrl: discogRecordings.previewUrl,
        ...OWNER_SELECT,
      })
      .from(discogReleaseTracks)
      .innerJoin(
        discogReleases,
        eq(discogReleaseTracks.releaseId, discogReleases.id)
      )
      .innerJoin(
        discogRecordings,
        eq(discogReleaseTracks.recordingId, discogRecordings.id)
      )
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(ctx.limit),
    db
      .select({ value: count() })
      .from(discogReleaseTracks)
      .innerJoin(
        discogReleases,
        eq(discogReleaseTracks.releaseId, discogReleases.id)
      )
      .innerJoin(
        discogRecordings,
        eq(discogReleaseTracks.recordingId, discogRecordings.id)
      )
      .innerJoin(
        creatorProfiles,
        eq(discogReleases.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause),
  ]);

  return {
    total,
    rows: rows.map(row => {
      const issues: string[] = [];
      if (!row.recordingIsrc) issues.push('No ISRC');
      if (!row.recordingDurationMs) issues.push('No duration');
      if (!row.recordingAudioUrl && !row.recordingPreviewUrl)
        issues.push('No audio');
      if (row.releaseDeletedAt) issues.push('Deleted release');
      return {
        id: row.id,
        assetType: 'track',
        title: row.title,
        subtitle: `${row.releaseTitle} · #${row.trackNumber}`,
        href: row.ownerUsername
          ? `/${row.ownerUsername}/${row.releaseSlug}`
          : null,
        thumbnailUrl: row.releaseArtworkUrl ?? null,
        status: row.releaseDeletedAt ? 'deleted' : row.releaseStatus,
        sourceType: row.sourceType,
        isExplicit: row.isExplicit,
        issues,
        createdAt: row.createdAt ?? null,
        ownerUsername: row.ownerUsername ?? null,
        ownerDisplayName: row.ownerDisplayName ?? null,
        ownerAvatarUrl: row.ownerAvatarUrl ?? null,
        ownerUserId: row.ownerUserId ?? null,
        ownerIsVerified: row.ownerIsVerified ?? false,
      };
    }),
  };
}

async function fetchLinkAssets(
  ctx: FetchContext
): Promise<{ rows: AdminAssetRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    ctx.likePattern
      ? or(
          ilike(socialLinks.platform, ctx.likePattern),
          ilike(socialLinks.url, ctx.likePattern),
          ilike(socialLinks.displayText, ctx.likePattern),
          ilike(creatorProfiles.username, ctx.likePattern),
          ilike(creatorProfiles.displayName, ctx.likePattern)
        )
      : undefined,
    ownerVerifiedCondition(ctx.verified),
  ];

  if (ctx.issuesOnly) {
    conditions.push(
      or(
        eq(socialLinks.isActive, false),
        eq(socialLinks.state, 'rejected'),
        eq(socialLinks.verificationStatus, 'failed')
      )
    );
  }

  const whereClause = and(...conditions);
  const orderBy = orderExpressions(ctx.sort, {
    title: socialLinks.platform,
    createdAt: socialLinks.createdAt,
  });

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: socialLinks.id,
        platform: socialLinks.platform,
        url: socialLinks.url,
        displayText: socialLinks.displayText,
        isActive: socialLinks.isActive,
        state: socialLinks.state,
        verificationStatus: socialLinks.verificationStatus,
        sourceType: socialLinks.sourceType,
        createdAt: socialLinks.createdAt,
        ...OWNER_SELECT,
      })
      .from(socialLinks)
      .innerJoin(
        creatorProfiles,
        eq(socialLinks.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(ctx.limit),
    db
      .select({ value: count() })
      .from(socialLinks)
      .innerJoin(
        creatorProfiles,
        eq(socialLinks.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause),
  ]);

  return {
    total,
    rows: rows.map(row => {
      const issues: string[] = [];
      if (!row.isActive) issues.push('Inactive');
      if (row.state === 'rejected') issues.push('Rejected');
      if (row.verificationStatus === 'failed')
        issues.push('Verification failed');
      return {
        id: row.id,
        assetType: 'link',
        title: row.displayText ?? row.platform,
        subtitle: row.url,
        href: row.url,
        thumbnailUrl: null,
        status: !row.isActive ? 'inactive' : row.state,
        sourceType: row.sourceType,
        isExplicit: false,
        issues,
        createdAt: row.createdAt ?? null,
        ownerUsername: row.ownerUsername ?? null,
        ownerDisplayName: row.ownerDisplayName ?? null,
        ownerAvatarUrl: row.ownerAvatarUrl ?? null,
        ownerUserId: row.ownerUserId ?? null,
        ownerIsVerified: row.ownerIsVerified ?? false,
      };
    }),
  };
}

async function fetchPhotoAssets(
  ctx: FetchContext
): Promise<{ rows: AdminAssetRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    ctx.likePattern
      ? or(
          ilike(profilePhotos.originalFilename, ctx.likePattern),
          ilike(profilePhotos.photoType, ctx.likePattern),
          ilike(creatorProfiles.username, ctx.likePattern),
          ilike(creatorProfiles.displayName, ctx.likePattern)
        )
      : undefined,
    ownerVerifiedCondition(ctx.verified),
  ];

  if (ctx.issuesOnly) {
    conditions.push(
      or(
        ne(profilePhotos.status, 'ready'),
        isNull(profilePhotos.blobUrl),
        isNotNull(profilePhotos.errorMessage),
        isNull(profilePhotos.creatorProfileId)
      )
    );
  }

  const whereClause = and(...conditions);
  const photoTitle = drizzleSql<string>`coalesce(${profilePhotos.originalFilename}, 'Photo')`;
  const orderBy = orderExpressions(ctx.sort, {
    title: photoTitle,
    createdAt: profilePhotos.createdAt,
  });

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: profilePhotos.id,
        title: photoTitle,
        photoType: profilePhotos.photoType,
        status: profilePhotos.status,
        blobUrl: profilePhotos.blobUrl,
        smallUrl: profilePhotos.smallUrl,
        errorMessage: profilePhotos.errorMessage,
        creatorProfileId: profilePhotos.creatorProfileId,
        sourceType: profilePhotos.sourceType,
        createdAt: profilePhotos.createdAt,
        ...OWNER_SELECT,
      })
      .from(profilePhotos)
      .leftJoin(
        creatorProfiles,
        eq(profilePhotos.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(ctx.limit),
    db
      .select({ value: count() })
      .from(profilePhotos)
      .leftJoin(
        creatorProfiles,
        eq(profilePhotos.creatorProfileId, creatorProfiles.id)
      )
      .where(whereClause),
  ]);

  return {
    total,
    rows: rows.map(row => {
      const issues: string[] = [];
      if (row.status === 'failed') issues.push('Failed');
      if (row.status !== 'ready' && row.status !== 'failed')
        issues.push(`Status: ${row.status}`);
      if (!row.blobUrl) issues.push('No file');
      if (row.errorMessage) issues.push('Error');
      if (!row.creatorProfileId) issues.push('No owner');
      return {
        id: row.id,
        assetType: 'photo',
        title: row.title,
        subtitle: row.photoType,
        href: row.blobUrl ?? null,
        thumbnailUrl: row.smallUrl ?? row.blobUrl ?? null,
        status: row.status,
        sourceType: row.sourceType,
        isExplicit: false,
        issues,
        createdAt: row.createdAt ?? null,
        ownerUsername: row.ownerUsername ?? null,
        ownerDisplayName: row.ownerDisplayName ?? null,
        ownerAvatarUrl: row.ownerAvatarUrl ?? null,
        ownerUserId: row.ownerUserId ?? null,
        ownerIsVerified: row.ownerIsVerified ?? false,
      };
    }),
  };
}

const ASSET_FETCHERS: Record<
  AdminAssetType,
  (ctx: FetchContext) => Promise<{ rows: AdminAssetRow[]; total: number }>
> = {
  release: fetchReleaseAssets,
  track: fetchTrackAssets,
  link: fetchLinkAssets,
  photo: fetchPhotoAssets,
};

function compareAssets(
  a: AdminAssetRow,
  b: AdminAssetRow,
  sort: AdminAssetSort
): number {
  switch (sort) {
    case 'created_asc':
      return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    case 'title_asc':
      return a.title.localeCompare(b.title);
    case 'title_desc':
      return b.title.localeCompare(a.title);
    case 'created_desc':
    default:
      return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  }
}

export async function getAdminAssets(
  params: AdminAssetsParams = {}
): Promise<AdminAssetsResult> {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const sanitizedSearch = sanitizeAssetSearch(params.search);
  const likePattern = sanitizedSearch ? `%${sanitizedSearch}%` : null;

  const sort: AdminAssetSort =
    params.sort && adminAssetSortFields.includes(params.sort)
      ? params.sort
      : 'created_desc';
  const issues: AdminAssetIssuesFilter =
    params.issues && adminAssetIssuesFilters.includes(params.issues)
      ? params.issues
      : 'all';
  const verified: AdminAssetVerifiedFilter =
    params.verified && adminAssetVerifiedFilters.includes(params.verified)
      ? params.verified
      : 'all';

  const enabledTypes: AdminAssetType[] =
    params.type && params.type !== 'all'
      ? adminAssetTypes.filter(t => t === params.type)
      : [...adminAssetTypes];

  const ctx: FetchContext = {
    likePattern,
    issuesOnly: issues === 'issues',
    verified,
    sort,
    // A merged global page needs up to offset+pageSize candidates per source.
    limit: offset + pageSize,
  };

  try {
    const results = await Promise.all(
      enabledTypes.map(type => ASSET_FETCHERS[type](ctx))
    );

    const merged = results
      .flatMap(r => r.rows)
      .sort((a, b) => compareAssets(a, b, sort));

    return {
      assets: merged.slice(offset, offset + pageSize),
      page,
      pageSize,
      total: results.reduce((acc, r) => acc + r.total, 0),
    };
  } catch (error) {
    captureError('Error loading admin asset library', error, {
      page,
      pageSize,
      search: params.search,
      type: params.type,
    });
    return { assets: [], page, pageSize, total: 0 };
  }
}
